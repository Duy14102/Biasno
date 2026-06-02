import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const audio = vi.hoisted(() => ({
  currentTime: 100,
  noteAtTime: vi.fn(),
  noteAtTimeWithOffset: vi.fn(),
}))
// sustainedEnd returns the bare key-up time (no pedal) so audible end == note end.
vi.mock('@/audio', () => ({
  audioEngine: audio,
  sustainedEnd: (noteEnd: number) => noteEnd,
}))

import { useAudioScheduler } from './useAudioScheduler'
import type { MidiFileData, MidiNote } from '@/types'
import type { NoteState } from './noteState'

const note = (id: string, time: number, duration = 1): MidiNote => ({
  id, midi: 60, time, duration, velocity: 0.8, name: 'C4', track: 0, hand: 'right', channel: 0,
})

const file = (notes: MidiNote[]): MidiFileData => ({
  name: 's.mid', duration: 1000, bpm: 120, timeSignature: { numerator: 4, denominator: 4 },
  notes, trackCount: 1, pedalEvents: [],
})

const pending = (n: MidiNote): NoteState => ({ note: n, visual: 'pending', flashAlpha: 0, scheduled: false })

function setup(states: Array<[string, NoteState]>, over: Partial<Parameters<typeof useAudioScheduler>[0]> = {}) {
  const notes = states.map(([, s]) => s.note)
  const refs = {
    isPlayingRef:    { current: true },
    currentTimeRef:  { current: 0 },
    bpmMultRef:      { current: 1 },
    visibleNotesRef: { current: notes },
    noteStatesRef:   { current: new Map<string, NoteState>(states) },
  }
  const setNoteStates = vi.fn((m: Map<string, NoteState> | ((p: Map<string, NoteState>) => Map<string, NoteState>)) => {
    refs.noteStatesRef.current = typeof m === 'function' ? m(refs.noteStatesRef.current) : m
  })
  const args = {
    midiFile: file(notes), isViewMode: true, ...refs, setNoteStates, ...over,
  }
  const view = renderHook((p: Parameters<typeof useAudioScheduler>[0]) => useAudioScheduler(p), { initialProps: args })
  return { ...view, refs, setNoteStates }
}

beforeEach(() => { vi.clearAllMocks(); audio.currentTime = 100 })
afterEach(() => vi.useRealTimers())

describe('useAudioScheduler — guards', () => {
  it('bails when not playing', () => {
    const s = setup([['a', pending(note('a', 0.1))]])
    s.refs.isPlayingRef.current = false
    act(() => { s.result.current.scheduleAudio() })
    expect(s.setNoteStates).not.toHaveBeenCalled()
    expect(audio.noteAtTime).not.toHaveBeenCalled()
  })

  it('bails when midiFile is null', () => {
    const s = setup([['a', pending(note('a', 0.1))]], { midiFile: null })
    act(() => { s.result.current.scheduleAudio() })
    expect(s.setNoteStates).not.toHaveBeenCalled()
  })

  it('bails when not in view mode', () => {
    const s = setup([['a', pending(note('a', 0.1))]], { isViewMode: false })
    act(() => { s.result.current.scheduleAudio() })
    expect(s.setNoteStates).not.toHaveBeenCalled()
  })
})

describe('useAudioScheduler — per-note branches', () => {
  it('skips notes missing from the map or already scheduled', () => {
    const scheduled: NoteState = { ...pending(note('a', 0.1)), scheduled: true }
    const s = setup([['a', scheduled]])
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTime).not.toHaveBeenCalled()
    expect(s.setNoteStates).not.toHaveBeenCalled()
  })

  it('marks fully-missed notes as missed without playing them', () => {
    // now=10, note at 5 dur 1 (ends 6). delaySong=-5 < -0.15, remaining=-4 < 0.05.
    const s = setup([['a', pending(note('a', 5, 1))]])
    s.refs.currentTimeRef.current = 10
    act(() => { s.result.current.scheduleAudio() })
    expect(s.refs.noteStatesRef.current.get('a')).toMatchObject({ visual: 'missed', scheduled: true })
    expect(audio.noteAtTime).not.toHaveBeenCalled()
  })

  it('mid-note resume plays remaining tail from an offset (no re-attack)', () => {
    // now=5.5, note at 5 dur 1 (ends 6). delaySong=-0.5 <0, remaining=0.5 >0.05.
    const s = setup([['a', pending(note('a', 5, 1))]])
    s.refs.currentTimeRef.current = 5.5
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTimeWithOffset).toHaveBeenCalledTimes(1)
    const [midi, , elapsed, remaining] = audio.noteAtTimeWithOffset.mock.calls[0]
    expect(midi).toBe(60)
    expect(elapsed).toBeCloseTo(0.5, 5)
    expect(remaining).toBeCloseTo(0.5, 5)
    expect(s.refs.noteStatesRef.current.get('a')).toMatchObject({ scheduled: true })
  })

  it('skips notes that just started but are essentially over (remaining ≤ 0.05, delaySong ≥ -0.15)', () => {
    // now=5.04, note at 5 dur 0.06 ends 5.06. delaySong=-0.04 (not < -0.15),
    // remaining=0.02 (not >0.05). Falls through missed + resume → delaySong<0 → return.
    const s = setup([['a', pending(note('a', 5, 0.06))]])
    s.refs.currentTimeRef.current = 5.04
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTime).not.toHaveBeenCalled()
    expect(audio.noteAtTimeWithOffset).not.toHaveBeenCalled()
    expect(s.setNoteStates).not.toHaveBeenCalled()
  })

  it('ignores notes beyond the lookahead+2s window', () => {
    // bpm 1, lookahead = 0.3 s. delaySong = 10 > 0.3+2.0.
    const s = setup([['a', pending(note('a', 10, 1))]])
    s.refs.currentTimeRef.current = 0
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTime).not.toHaveBeenCalled()
  })

  it('does NOT schedule a note inside the +2s buffer but past the lookahead window', () => {
    // delaySong = 1.0 — > lookahead 0.3 but < 0.3+2.0, so passes the range
    // filter yet fails the `delaySong <= lookahead` schedule check.
    const s = setup([['a', pending(note('a', 1.0, 1))]])
    s.refs.currentTimeRef.current = 0
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTime).not.toHaveBeenCalled()
    expect(s.setNoteStates).not.toHaveBeenCalled()
  })

  it('schedules an upcoming note inside the lookahead window', () => {
    // delaySong = 0.2 ≤ lookahead 0.3.
    const s = setup([['a', pending(note('a', 0.2, 1))]])
    s.refs.currentTimeRef.current = 0
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTime).toHaveBeenCalledTimes(1)
    const [midi, startTime, dur] = audio.noteAtTime.mock.calls[0]
    expect(midi).toBe(60)
    expect(startTime).toBeCloseTo(audio.currentTime + 0.2, 5)
    expect(dur).toBeCloseTo(1, 5)
    expect(s.refs.noteStatesRef.current.get('a')).toMatchObject({ scheduled: true })
    expect(s.setNoteStates).toHaveBeenCalledTimes(1)
  })

  it('lookahead window scales with the bpm multiplier', () => {
    // bpm 0.5 → lookaheadSong = 0.3 * 0.5 = 0.15. delaySong 0.2 > 0.15 → NOT scheduled.
    const s = setup([['a', pending(note('a', 0.2, 1))]])
    s.refs.currentTimeRef.current = 0
    s.refs.bpmMultRef.current = 0.5
    act(() => { s.result.current.scheduleAudio() })
    expect(audio.noteAtTime).not.toHaveBeenCalled()
  })

  it('the 25 ms interval drives scheduling passes', () => {
    vi.useFakeTimers()
    const s = setup([['a', pending(note('a', 0.2, 1))]])
    s.refs.currentTimeRef.current = 0
    act(() => { vi.advanceTimersByTime(25) })
    expect(audio.noteAtTime).toHaveBeenCalled()
  })
})
