import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const audio = vi.hoisted(() => ({
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  setSustainPedal: vi.fn(),
}))
const midi = vi.hoisted(() => ({
  subscribe: vi.fn<(cb: (m: number, v: number, on: boolean) => void) => () => void>(() => () => {}),
  subscribePedal: vi.fn<(cb: (d: boolean) => void) => () => void>(() => () => {}),
}))
vi.mock('@/audio', () => ({ audioEngine: audio }))
vi.mock('@/context', () => ({ useMidi: () => midi }))

import { usePracticeInput } from './usePracticeInput'
import type { MidiNote } from '@/types'
import type { NoteState } from './noteState'

const note = (id: string, midiN: number, time: number, duration = 1): MidiNote => ({
  id, midi: midiN, time, duration, velocity: 0.8, name: 'C4', track: 0, hand: 'right', channel: 0,
})

const st = (n: MidiNote, visual: NoteState['visual']): NoteState =>
  ({ note: n, visual, flashAlpha: 0, scheduled: false })

function setup(states: Array<[string, NoteState]>, over: Partial<Parameters<typeof usePracticeInput>[0]> = {}) {
  const refs = {
    isPlayingRef:   { current: true },
    currentTimeRef: { current: 5 },
    noteStatesRef:  { current: new Map<string, NoteState>(states) },
    holdingRef:     { current: new Map<string, number>() },
  }
  const setters = {
    setActiveKeys:  vi.fn(),
    setNoteStates:  vi.fn((m: Map<string, NoteState> | ((p: Map<string, NoteState>) => Map<string, NoteState>)) => {
      refs.noteStatesRef.current = typeof m === 'function' ? m(refs.noteStatesRef.current) : m
    }),
    setIsPlaying:   vi.fn(),
  }
  const triggerFlash = vi.fn()
  const onInput = vi.fn()
  const onWrongPress = vi.fn()
  const args = {
    isViewMode: false, needsMelody: false, ...refs, ...setters,
    triggerFlash, onInput, onWrongPress, ...over,
  }
  const view = renderHook((p: Parameters<typeof usePracticeInput>[0]) => usePracticeInput(p), { initialProps: args })
  return { ...view, refs, setters, triggerFlash, onInput, onWrongPress }
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())

describe('usePracticeInput — view-listen short-circuit', () => {
  it('ignores all input in view mode', () => {
    const s = setup([], { isViewMode: true })
    act(() => { s.result.current.handleNoteInput(60, 0.8, true) })
    expect(audio.noteOn).not.toHaveBeenCalled()
    expect(s.onInput).not.toHaveBeenCalled()
  })
})

describe('usePracticeInput — key-down matching', () => {
  it('correct hit on an active note → noteOn, correct key flash, holding', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'active')]])
    act(() => { s.result.current.handleNoteInput(60, 0.9, true) })
    expect(s.onInput).toHaveBeenCalled()
    expect(audio.noteOn).toHaveBeenCalledWith(60, 0.9)
    expect(s.refs.holdingRef.current.get('a')).toBe(60)
    expect(s.refs.noteStatesRef.current.get('a')).toMatchObject({ visual: 'holding' })
    expect(s.setters.setActiveKeys).toHaveBeenCalled()
  })

  it('needsMelody requires pitch match — same-time wrong pitch is NOT a match', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'active')]], { needsMelody: true })
    act(() => { s.result.current.handleNoteInput(62, 0.8, true) })   // wrong pitch
    expect(s.refs.holdingRef.current.size).toBe(0)
    expect(audio.noteOn).toHaveBeenCalledWith(62, 0.8 * 0.25)        // wrong-press path
    expect(s.onWrongPress).toHaveBeenCalled()
  })

  it('matches a holding note re-press within its duration (early-release retry)', () => {
    // now=5.5 inside note [5,6); within timing window false (dMs=500>220) but withinDuration true.
    const s = setup([['a', st(note('a', 60, 5, 1), 'holding')]])
    s.refs.currentTimeRef.current = 5.5
    act(() => { s.result.current.handleNoteInput(60, 0.7, true) })
    expect(s.refs.holdingRef.current.get('a')).toBe(60)
  })

  it('wrong key with an out-of-window active note → quiet noteOn + onWrongPress(now, note)', () => {
    // Active note far ahead (time 9, now 5): dMs=4000 > window AND now < time-0.1,
    // so it fails the match but is still the nearest active note for the penalty scale.
    const s = setup([['a', st(note('a', 64, 9, 1), 'active')]])
    act(() => { s.result.current.handleNoteInput(60, 0.8, true) })
    expect(audio.noteOn).toHaveBeenCalledWith(60, 0.2)
    expect(s.onWrongPress).toHaveBeenCalledTimes(1)
    const [now, active] = s.onWrongPress.mock.calls[0]
    expect(now).toBe(5)
    expect(active?.id).toBe('a')
  })

  it('wrong key with no active note → onWrongPress(now, null)', () => {
    const s = setup([['a', st(note('a', 64, 5, 1), 'pending')]])   // not active/holding
    act(() => { s.result.current.handleNoteInput(60, 0.8, true) })
    expect(s.onWrongPress).toHaveBeenCalledWith(5, null)
  })
})

describe('usePracticeInput — key-up / release', () => {
  it('noteOff + clears the active key', () => {
    const s = setup([])
    act(() => { s.result.current.handleNoteInput(60, 0, false) })
    expect(audio.noteOff).toHaveBeenCalledWith(60)
    expect(s.setters.setActiveKeys).toHaveBeenCalled()
  })

  it('releasing a held note past 95% → confirmed hit flash', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'holding')]])
    s.refs.holdingRef.current.set('a', 60)
    s.refs.currentTimeRef.current = 6   // >= end 6 - tolerance
    act(() => { s.result.current.handleNoteInput(60, 0, false) })
    expect(s.triggerFlash).toHaveBeenCalledWith('a', 'hit')
    expect(s.refs.holdingRef.current.size).toBe(0)
  })

  it('releasing a held note too early → reverts to active for retry', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'holding')]])
    s.refs.holdingRef.current.set('a', 60)
    s.refs.currentTimeRef.current = 5.1   // well before end 6
    act(() => { s.result.current.handleNoteInput(60, 0, false) })
    expect(s.triggerFlash).not.toHaveBeenCalled()
    expect(s.refs.noteStatesRef.current.get('a')).toMatchObject({ visual: 'active', scheduled: false })
  })

  it('release skips holds bound to a different midi number', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'holding')]])
    s.refs.holdingRef.current.set('a', 60)
    act(() => { s.result.current.handleNoteInput(62, 0, false) })   // different key
    expect(s.refs.holdingRef.current.get('a')).toBe(60)            // untouched
    expect(s.triggerFlash).not.toHaveBeenCalled()
  })

  it('release of a held note whose state vanished is a safe no-op', () => {
    const s = setup([])
    s.refs.holdingRef.current.set('gone', 60)   // id not in noteStates
    act(() => { s.result.current.handleNoteInput(60, 0, false) })
    expect(s.triggerFlash).not.toHaveBeenCalled()
  })
})

describe('usePracticeInput — suppressDeviceAudio (real piano makes its own sound)', () => {
  it('device input is NOT re-synthesised when suppressed, but state still updates', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'active')]], { suppressDeviceAudio: true })
    act(() => { s.result.current.handleNoteInput(60, 0.9, true, true) })   // fromDevice
    expect(audio.noteOn).not.toHaveBeenCalled()
    // Visual / hold tracking still happen — only the audio is suppressed.
    expect(s.refs.holdingRef.current.get('a')).toBe(60)
    expect(s.setters.setActiveKeys).toHaveBeenCalled()
    act(() => { s.result.current.handleNoteInput(60, 0, false, true) })
    expect(audio.noteOff).not.toHaveBeenCalled()
  })

  it('device input still plays when suppression is off', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'active')]], { suppressDeviceAudio: false })
    act(() => { s.result.current.handleNoteInput(60, 0.9, true, true) })
    expect(audio.noteOn).toHaveBeenCalledWith(60, 0.9)
  })

  it('non-device input (computer keyboard / clicks) always plays, even when suppressed', () => {
    const s = setup([['a', st(note('a', 60, 5, 1), 'active')]], { suppressDeviceAudio: true })
    act(() => { s.result.current.handleNoteInput(60, 0.9, true) })   // no fromDevice flag
    expect(audio.noteOn).toHaveBeenCalledWith(60, 0.9)
  })

  it('the MIDI subscription forwards input as fromDevice', () => {
    setup([['a', st(note('a', 60, 5, 1), 'active')]], { suppressDeviceAudio: true })
    const cb = midi.subscribe.mock.calls.at(-1)![0]
    act(() => { cb(60, 0.9, true) })
    expect(audio.noteOn).not.toHaveBeenCalled()   // suppressed because it's device input
  })
})

describe('usePracticeInput — global wiring', () => {
  it('subscribes to MIDI + pedal on mount', () => {
    setup([])
    expect(midi.subscribe).toHaveBeenCalled()
    expect(midi.subscribePedal).toHaveBeenCalled()
  })

  it('computer keyboard key triggers a note input (z → 48)', () => {
    const s = setup([['a', st(note('a', 48, 5, 1), 'active')]])
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' })) })
    expect(audio.noteOn).toHaveBeenCalledWith(48, expect.anything())
    expect(s.refs.holdingRef.current.get('a')).toBe(48)
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'z' })) })
    expect(audio.noteOff).toHaveBeenCalledWith(48)
  })

  it('spacebar toggles play/pause and ignores key repeats', () => {
    const s = setup([])
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })) })
    expect(s.setters.setIsPlaying).toHaveBeenCalled()
    // repeat is ignored for mapped keys
    audio.noteOn.mockClear()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', repeat: true })) })
    expect(audio.noteOn).not.toHaveBeenCalled()
  })

  it('pedal subscription forwards to audioEngine.setSustainPedal', () => {
    setup([])
    const cb = midi.subscribePedal.mock.calls.at(-1)![0] as (d: boolean) => void
    cb(true)
    expect(audio.setSustainPedal).toHaveBeenCalledWith(true)
  })
})
