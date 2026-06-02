import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const audio = vi.hoisted(() => ({
  stopAll: vi.fn(),
  restoreVolume: vi.fn(),
}))
vi.mock('@/audio', () => ({ audioEngine: audio }))
vi.mock('@/context', () => ({
  modePrefsKey: (name: string, mode: string) => `${name}|${mode}`,
}))

import { useModeChange } from './useModeChange'
import type { MidiFileData, MidiNote, PracticeMode } from '@/types'
import type { NoteState } from './noteState'

const note = (id: string, time: number, duration = 1): MidiNote => ({
  id, midi: 60, time, duration, velocity: 0.8, name: 'C4', track: 0, hand: 'right', channel: 0,
})

const file = (notes: MidiNote[]): MidiFileData => ({
  name: 's.mid', duration: 100, bpm: 120, timeSignature: { numerator: 4, denominator: 4 },
  notes, trackCount: 1,
})

function setup(over: Partial<Parameters<typeof useModeChange>[0]> = {}) {
  const refs = {
    isPlayingRef:   { current: false },
    currentTimeRef: { current: 10 },
    lastRAFTime:    { current: 999 },
    pressedMidi:    { current: new Set<number>([1]) },
    holdingRef:     { current: new Map<string, number>([['x', 1]]) },
    noteStatesRef:  { current: new Map<string, NoteState>() },
  }
  const setters = {
    setMode:             vi.fn(),
    setIsPlaying:        vi.fn(),
    setCurrentTime:      vi.fn(),
    setNoteStates:       vi.fn(),
    setActiveKeys:       vi.fn(),
    setShowSheetMusic:   vi.fn(),
    setShowFallingNotes: vi.fn(),
  }
  const scheduleAudio = vi.fn()
  const args = {
    mode: 'view-listen' as PracticeMode,
    midiFile: file([]),
    modePrefs: {},
    ...refs, ...setters, scheduleAudio, ...over,
  }
  const view = renderHook((p: Parameters<typeof useModeChange>[0]) => useModeChange(p), { initialProps: args })
  return { ...view, refs, setters, scheduleAudio, args }
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())

describe('useModeChange', () => {
  it('no-ops when newMode equals current mode', () => {
    const { result, setters } = setup({ mode: 'both-melody' })
    act(() => { result.current.handleModeChange('both-melody') })
    expect(setters.setMode).not.toHaveBeenCalled()
    expect(audio.stopAll).not.toHaveBeenCalled()
  })

  it('stops audio, resets refs, commits the new mode', () => {
    vi.useFakeTimers()
    const { result, refs, setters } = setup()
    act(() => { result.current.handleModeChange('both-melody') })
    expect(audio.stopAll).toHaveBeenCalled()
    expect(refs.isPlayingRef.current).toBe(false)
    expect(refs.lastRAFTime.current).toBe(0)
    expect(refs.pressedMidi.current.size).toBe(0)
    expect(refs.holdingRef.current.size).toBe(0)
    expect(setters.setMode).toHaveBeenCalledWith('both-melody')
    expect(setters.setActiveKeys).toHaveBeenCalledWith(new Map())
  })

  it('seeks back to the most recent still-sounding note onset (cap 3 s)', () => {
    vi.useFakeTimers()
    // t=10. Note started at 8, dur 5 (ends 13 > 10), within 3 s of t → seekTarget 8.
    const { result, refs, setters } = setup({
      midiFile: file([note('a', 8, 5), note('b', 2, 1)]),
    })
    act(() => { result.current.handleModeChange('both-melody') })
    expect(refs.currentTimeRef.current).toBe(8)
    expect(setters.setCurrentTime).toHaveBeenCalledWith(8)
  })

  it('keeps current time when no qualifying sounding note (older than 3 s)', () => {
    vi.useFakeTimers()
    // started at 6 (= t-4, outside 3 s window) → no seek-back, target stays 10.
    const { result, refs } = setup({
      midiFile: file([note('a', 6, 10)]),
    })
    act(() => { result.current.handleModeChange('both-melody') })
    expect(refs.currentTimeRef.current).toBe(10)
  })

  it('rebuilds noteStates relative to seek target (future=pending, past=hit)', () => {
    vi.useFakeTimers()
    let captured: Map<string, NoteState> | null = null
    const { result, setters } = setup({
      midiFile: file([note('future', 50, 1), note('past', 2, 1)]),
    })
    setters.setNoteStates.mockImplementation((m: Map<string, NoteState>) => { captured = m })
    act(() => { result.current.handleModeChange('both-melody') })   // no sounding note → target 10
    expect(captured!.get('future')).toMatchObject({ visual: 'pending', scheduled: false })
    expect(captured!.get('past')).toMatchObject({ visual: 'hit', scheduled: true })
  })

  it('restores toggles from modePrefs for the (song, mode) pair', () => {
    vi.useFakeTimers()
    const { result, setters } = setup({
      modePrefs: { 's.mid|both-melody': { showSheetMusic: true, showFallingNotes: false } },
    })
    act(() => { result.current.handleModeChange('both-melody') })
    expect(setters.setShowSheetMusic).toHaveBeenCalledWith(true)
    expect(setters.setShowFallingNotes).toHaveBeenCalledWith(false)
  })

  it('falls back to defaults when no modePrefs entry exists', () => {
    vi.useFakeTimers()
    const { result, setters } = setup()
    act(() => { result.current.handleModeChange('both-melody') })
    expect(setters.setShowSheetMusic).toHaveBeenCalledWith(false)
    expect(setters.setShowFallingNotes).toHaveBeenCalledWith(true)
  })

  it('uses defaults when midiFile is null (no prefs lookup, no notes)', () => {
    vi.useFakeTimers()
    let captured: Map<string, NoteState> | null = null
    const { result, refs, setters } = setup({ midiFile: null })
    setters.setNoteStates.mockImplementation((m: Map<string, NoteState>) => { captured = m })
    act(() => { result.current.handleModeChange('both-melody') })
    expect(refs.currentTimeRef.current).toBe(10)   // no seek-back without notes
    expect(captured!.size).toBe(0)
    expect(setters.setShowFallingNotes).toHaveBeenCalledWith(true)
  })

  it('triggers transition flash that clears on its timers', () => {
    vi.useFakeTimers()
    const { result } = setup()
    act(() => { result.current.handleModeChange('both-melody') })
    expect(result.current.modeTransitioning).toBe(true)
    expect(result.current.modeFlash).toBe('both-melody')
    act(() => { vi.advanceTimersByTime(260) })
    expect(result.current.modeTransitioning).toBe(false)
    expect(result.current.modeFlash).toBe('both-melody')
    act(() => { vi.advanceTimersByTime(1100 - 260) })
    expect(result.current.modeFlash).toBe(null)
  })

  it('does NOT resume playback when it was paused', () => {
    vi.useFakeTimers()
    const { result, refs, setters } = setup()
    refs.isPlayingRef.current = false
    act(() => { result.current.handleModeChange('both-melody') })
    act(() => { vi.advanceTimersByTime(0) })
    expect(setters.setIsPlaying).not.toHaveBeenCalledWith(true)
    expect(audio.restoreVolume).not.toHaveBeenCalled()
  })

  it('resumes playback + schedules when it was playing', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const { result, refs, setters, scheduleAudio } = setup()
    refs.isPlayingRef.current = true
    act(() => { result.current.handleModeChange('both-melody') })
    expect(audio.restoreVolume).toHaveBeenCalled()
    expect(setters.setIsPlaying).toHaveBeenCalledWith(true)
    expect(refs.isPlayingRef.current).toBe(true)
    act(() => { vi.advanceTimersByTime(0) })   // flush the setTimeout(…, 0)
    expect(scheduleAudio).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
