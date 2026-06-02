import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const audio = vi.hoisted(() => ({
  stopAll: vi.fn(),
  restoreVolume: vi.fn(),
}))
vi.mock('@/audio', () => ({ audioEngine: audio }))

import { useTransport } from './useTransport'
import type { MidiFileData, MidiNote, LoopRegion } from '@/types'
import type { NoteState } from './noteState'

const note = (id: string, time: number, duration = 1): MidiNote => ({
  id, midi: 60, time, duration, velocity: 0.8, name: 'C4', track: 0, hand: 'right', channel: 0,
})

const file = (notes: MidiNote[], duration = 100): MidiFileData => ({
  name: 's.mid', duration, bpm: 120, timeSignature: { numerator: 4, denominator: 4 },
  notes, trackCount: 1,
})

function setup(over: Partial<Parameters<typeof useTransport>[0]> = {}) {
  const refs = {
    isPlayingRef:   { current: false },
    currentTimeRef: { current: 10 },
    lastRAFTime:    { current: 999 },
    loopEnabledRef: { current: false },
    loopRegionRef:  { current: null as LoopRegion | null },
    pressedMidi:    { current: new Set<number>([1]) },
    holdingRef:     { current: new Map<string, number>([['x', 1]]) },
    viewActiveRef:  { current: 'stale' },
    noteStatesRef:  { current: new Map<string, NoteState>() },
  }
  const setters = {
    setIsPlaying:   vi.fn(),
    setCurrentTime: vi.fn(),
    setNoteStates:  vi.fn(),
    setActiveKeys:  vi.fn(),
  }
  const scheduleAudio = vi.fn()
  const args = {
    midiFile: file([], 100), isViewMode: false, leadIn: 2,
    ...refs, ...setters, scheduleAudio, ...over,
  }
  const { result } = renderHook(() => useTransport(args as Parameters<typeof useTransport>[0]))
  return { result, refs, setters, scheduleAudio }
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())

describe('useTransport — seek', () => {
  it('seek(<=0) snaps to -leadIn (restart-from-top)', () => {
    const { result, refs, setters } = setup()
    act(() => { result.current.seek(0) })
    expect(refs.currentTimeRef.current).toBe(-2)
    expect(setters.setCurrentTime).toHaveBeenCalledWith(-2)
  })

  it('seek positive clamps to duration', () => {
    const { result, refs } = setup({ midiFile: file([], 50) })
    act(() => { result.current.seek(999) })
    expect(refs.currentTimeRef.current).toBe(50)
  })

  it('seek positive lands exactly where pointed and resets transport refs', () => {
    const { result, refs, setters } = setup()
    act(() => { result.current.seek(20) })
    expect(refs.currentTimeRef.current).toBe(20)
    expect(refs.lastRAFTime.current).toBe(0)
    expect(refs.viewActiveRef.current).toBe('')
    expect(refs.holdingRef.current.size).toBe(0)
    expect(setters.setActiveKeys).toHaveBeenCalledWith(new Map())
  })

  it('buckets notes: future/mid-sustain → pending, fully past → hit', () => {
    const states = new Map<string, NoteState>([
      ['future',  { note: note('future', 30, 1),  visual: 'active',  flashAlpha: 1, scheduled: true }],
      ['midsus',  { note: note('midsus', 18, 5),   visual: 'active',  flashAlpha: 1, scheduled: true }], // ends 23 > 20.05
      ['past',    { note: note('past', 5, 1),       visual: 'pending', flashAlpha: 0, scheduled: false }], // ends 6 < 20
    ])
    let captured: Map<string, NoteState> | null = null
    const { result, refs, setters } = setup()
    refs.noteStatesRef.current = states
    setters.setNoteStates.mockImplementation((m: Map<string, NoteState>) => { captured = m })
    act(() => { result.current.seek(20) })
    expect(captured!.get('future')).toMatchObject({ visual: 'pending', scheduled: false })
    expect(captured!.get('midsus')).toMatchObject({ visual: 'pending', scheduled: false })
    expect(captured!.get('past')).toMatchObject({ visual: 'hit', scheduled: true })
  })

  it('view-listen + playing stops audio so it restarts from new pos', () => {
    const { result } = setup({ isViewMode: true })
    // not playing → no stopAll
    act(() => { result.current.seek(20) })
    expect(audio.stopAll).not.toHaveBeenCalled()
  })

  it('view-listen + playing → stopAll + restoreVolume + schedules', () => {
    const { result, refs, scheduleAudio } = setup({ isViewMode: true })
    refs.isPlayingRef.current = true
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    act(() => { result.current.seek(20) })
    expect(audio.stopAll).toHaveBeenCalled()
    expect(audio.restoreVolume).toHaveBeenCalled()
    expect(scheduleAudio).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not schedule when paused', () => {
    const { result, scheduleAudio } = setup()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    act(() => { result.current.seek(20) })
    expect(scheduleAudio).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('useTransport — play / pause / stop', () => {
  it('play sets playing true + schedules', () => {
    const { result, refs, setters, scheduleAudio } = setup()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    act(() => { result.current.play() })
    expect(audio.restoreVolume).toHaveBeenCalled()
    expect(setters.setIsPlaying).toHaveBeenCalledWith(true)
    expect(refs.isPlayingRef.current).toBe(true)
    expect(scheduleAudio).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('pause stops audio, clears press/hold sets, resets scheduled flags', () => {
    const states = new Map<string, NoteState>([
      // scheduled + not yet ended (end 15 > t 10) → reset, playing→active
      ['a', { note: note('a', 14, 1), visual: 'playing', flashAlpha: 0, scheduled: true }],
      // scheduled but already ended (end 6 < 10) → untouched
      ['b', { note: note('b', 5, 1),  visual: 'hit',     flashAlpha: 0, scheduled: true }],
    ])
    const { result, refs, setters } = setup()
    refs.noteStatesRef.current = states
    let captured: Map<string, NoteState> | null = null
    setters.setNoteStates.mockImplementation((u: (p: Map<string, NoteState>) => Map<string, NoteState>) => { captured = u(states) })
    act(() => { result.current.pause() })
    expect(audio.stopAll).toHaveBeenCalled()
    expect(setters.setIsPlaying).toHaveBeenCalledWith(false)
    expect(refs.isPlayingRef.current).toBe(false)
    expect(refs.lastRAFTime.current).toBe(0)
    expect(refs.pressedMidi.current.size).toBe(0)
    expect(refs.holdingRef.current.size).toBe(0)
    expect(captured!.get('a')).toMatchObject({ scheduled: false, visual: 'active' })
    expect(captured!.get('b')).toMatchObject({ scheduled: true, visual: 'hit' })
  })

  it('pause is a no-op updater (returns prev) when nothing is scheduled-and-unfinished', () => {
    const states = new Map<string, NoteState>([
      ['b', { note: note('b', 5, 1), visual: 'hit', flashAlpha: 0, scheduled: false }],
    ])
    const { result, refs, setters } = setup()
    refs.noteStatesRef.current = states
    let captured: Map<string, NoteState> | null = null
    setters.setNoteStates.mockImplementation((u: (p: Map<string, NoteState>) => Map<string, NoteState>) => { captured = u(states) })
    act(() => { result.current.pause() })
    expect(captured).toBe(states)   // same ref → no change
  })

  it('stop pauses then seeks to 0 (→ -leadIn)', () => {
    const { result, refs } = setup()
    act(() => { result.current.stop() })
    expect(refs.isPlayingRef.current).toBe(false)
    expect(refs.currentTimeRef.current).toBe(-2)
  })
})

describe('useTransport — header buttons', () => {
  it('handlePlayPause toggles: playing → pause', () => {
    const { result, refs, setters } = setup()
    refs.isPlayingRef.current = true
    act(() => { result.current.handlePlayPause() })
    expect(setters.setIsPlaying).toHaveBeenCalledWith(false)
  })

  it('handlePlayPause toggles: paused → play', () => {
    const { result, setters } = setup()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    act(() => { result.current.handlePlayPause() })
    expect(setters.setIsPlaying).toHaveBeenCalledWith(true)
    vi.unstubAllGlobals()
  })

  it('handleRewind clamps at 0 (lower bound, no loop)', () => {
    const { result, refs } = setup()
    refs.currentTimeRef.current = 3   // 3 - 5 = -2 → clamp lo=0 → seek(0) → -leadIn
    act(() => { result.current.handleRewind() })
    expect(refs.currentTimeRef.current).toBe(-2)
  })

  it('handleRewind subtracts REWIND_AMOUNT when room remains', () => {
    const { result, refs } = setup()
    refs.currentTimeRef.current = 30
    act(() => { result.current.handleRewind() })
    expect(refs.currentTimeRef.current).toBe(25)
  })

  it('handleFastForward clamps at duration (upper bound, no loop)', () => {
    const { result, refs } = setup({ midiFile: file([], 50) })
    refs.currentTimeRef.current = 48   // 48 + 5 = 53 → clamp hi=50
    act(() => { result.current.handleFastForward() })
    expect(refs.currentTimeRef.current).toBe(50)
  })

  it('handleRewind clamps to loop region bounds when looping', () => {
    const region: LoopRegion = { start: 0.2, end: 0.5 }   // dur 100 → [20,50]
    const { result, refs } = setup()
    refs.loopEnabledRef.current = true
    refs.loopRegionRef.current = region
    refs.currentTimeRef.current = 22   // 22-5=17 → clamp lo=20
    act(() => { result.current.handleRewind() })
    expect(refs.currentTimeRef.current).toBe(20)
  })

  it('handleFastForward clamps to loop region upper bound when looping', () => {
    const region: LoopRegion = { start: 0.2, end: 0.5 }   // [20,50]
    const { result, refs } = setup()
    refs.loopEnabledRef.current = true
    refs.loopRegionRef.current = region
    refs.currentTimeRef.current = 48   // 48+5=53 → clamp hi=50
    act(() => { result.current.handleFastForward() })
    expect(refs.currentTimeRef.current).toBe(50)
  })

  it('handleRestart pauses, seeks to -leadIn, then plays', () => {
    const { result, refs, setters } = setup()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    act(() => { result.current.handleRestart() })
    expect(refs.currentTimeRef.current).toBe(-2)
    expect(refs.isPlayingRef.current).toBe(true)
    expect(setters.setIsPlaying).toHaveBeenLastCalledWith(true)
    vi.unstubAllGlobals()
  })

  it('rewind/fast-forward use [0,0] when midiFile is null', () => {
    const { result, refs } = setup({ midiFile: null })
    refs.currentTimeRef.current = 10
    act(() => { result.current.handleFastForward() })   // min(0, max(0, 15)) = 0 → seek(0) → -leadIn
    expect(refs.currentTimeRef.current).toBe(-2)
  })
})
