import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'

vi.mock('@/audio', () => ({ audioEngine: { restoreVolume: vi.fn() } }))

import { usePlayhead } from './usePlayhead'
import type { MidiFileData, MidiNote } from '@/types'
import type { NoteState } from './noteState'

// Capture the rAF callback so the test can drive frames deterministically.
let rafCb: ((t: number) => void) | null = null
beforeEach(() => {
  rafCb = null
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafCb = cb; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

const ref = <T,>(v: T): React.MutableRefObject<T> => ({ current: v })

const mkNote = (id: string, time: number, duration: number): MidiNote =>
  ({ id, midi: 60, time, duration, hand: 'right', velocity: 1 } as MidiNote)

function build(over: Partial<Parameters<typeof usePlayhead>[0]> = {}) {
  const midiFile = { duration: 10, notes: [] } as unknown as MidiFileData
  const args = {
    midiFile,
    isViewMode: false,
    leadIn: 1,
    isPlayingRef:   ref(true),
    currentTimeRef: ref(0),
    bpmMultRef:     ref(1),
    lastRAFTime:    ref(0),
    loopEnabledRef: ref(false),
    loopRegionRef:  ref<null | { start: number; end: number }>(null),
    viewActiveRef:  ref(''),
    pressedMidi:    ref(new Set<number>()),
    holdingRef:     ref(new Map<string, number>()),
    visibleNotesRef: ref<MidiNote[]>([]),
    noteStatesRef:  ref(new Map<string, NoteState>()),
    setCurrentTime: vi.fn(),
    setNoteStates:  vi.fn((u) => u),
    setActiveKeys:  vi.fn(),
    triggerFlash:   vi.fn(),
    ...over,
  }
  renderHook(() => usePlayhead(args as Parameters<typeof usePlayhead>[0]))
  return args
}

describe('usePlayhead', () => {
  it('advances currentTime by elapsed delta × bpm multiplier while playing', () => {
    const args = build({ bpmMultRef: ref(2) })
    rafCb!(1000)   // primes lastRAFTime
    rafCb!(2000)   // +1000ms = 1s real * 2x = 2s
    expect(args.currentTimeRef.current).toBeCloseTo(2, 5)
    expect(args.setCurrentTime).toHaveBeenCalled()
  })

  it('does not advance time while paused, and resets lastRAFTime', () => {
    const args = build({ isPlayingRef: ref(false), lastRAFTime: ref(999) })
    rafCb!(500)
    expect(args.currentTimeRef.current).toBe(0)
    expect(args.lastRAFTime.current).toBe(0)
  })

  it('freezes time in wait mode when a visible note is blocking at the hit line', () => {
    const note = mkNote('n1', 0, 1)
    const states = new Map<string, NoteState>([
      ['n1', { note, visual: 'active', scheduled: true, flashAlpha: 0 } as NoteState],
    ])
    const args = build({
      visibleNotesRef: ref([note]),
      noteStatesRef:   ref(states),
    })
    rafCb!(1000)
    rafCb!(2000)
    expect(args.currentTimeRef.current).toBe(0) // frozen
  })

  it('wraps to loop start and fires onLoopWrap when the loop end is crossed', () => {
    const onLoopWrap = vi.fn()
    const args = build({
      loopEnabledRef: ref(true),
      loopRegionRef:  ref({ start: 0.1, end: 0.2 }), // 1s..2s of a 10s song
      currentTimeRef: ref(1.9),
      onLoopWrap,
    })
    rafCb!(1000)
    rafCb!(2000) // +1s → 2.9 > loopEnd(2) → wrap
    expect(onLoopWrap).toHaveBeenCalledTimes(1)
    expect(args.currentTimeRef.current).toBeCloseTo(1, 5) // loopStart
  })

  it('fires onSongEnd once in practice mode and wraps to -leadIn at end of song', () => {
    const onSongEnd = vi.fn()
    const args = build({ currentTimeRef: ref(9.9), leadIn: 1.5, onSongEnd })
    rafCb!(1000)
    rafCb!(2000) // 9.9 + 1 = 10.9 > duration(10)
    expect(onSongEnd).toHaveBeenCalledTimes(1)
    expect(args.currentTimeRef.current).toBe(-1.5)
  })

  it('does NOT fire onSongEnd in view-listen mode', () => {
    const onSongEnd = vi.fn()
    build({ isViewMode: true, currentTimeRef: ref(9.9), onSongEnd })
    rafCb!(1000)
    rafCb!(2000)
    expect(onSongEnd).not.toHaveBeenCalled()
  })
})
