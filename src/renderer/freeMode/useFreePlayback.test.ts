import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const engine = vi.hoisted(() => ({
  _t: 0,
  get currentTime() { return engine._t },
  noteAtTime: vi.fn(), stopAll: vi.fn(), restoreVolume: vi.fn(),
}))
vi.mock('@/audio', () => ({
  audioEngine: engine,
  // sustainedEnd: no pedal extension — return the key end as-is.
  sustainedEnd: (keyEnd: number) => keyEnd,
}))

import { useFreePlayback } from './useFreePlayback'
import type { FreeSnapshot, RecordedNote } from './types'

const note = (id: string, midi: number, startMs: number, endMs: number): RecordedNote =>
  ({ id, midi, velocity: 1, startMs, endMs })

const snap = (over: Partial<FreeSnapshot> = {}): FreeSnapshot => ({
  notes: [note('a', 60, 0, 500), note('b', 64, 600, 1000)],
  durationMs: 1000, trimStartMs: 0, trimEndMs: 1000, clips: [], ...over,
})

beforeEach(() => {
  engine._t = 0
  engine.noteAtTime.mockClear(); engine.stopAll.mockClear(); engine.restoreVolume.mockClear()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)) // park the tick loop
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('useFreePlayback', () => {
  it('seek clamps the head into the trim region', () => {
    const s = snap({ trimStartMs: 100, trimEndMs: 800 })
    const { result } = renderHook(() => useFreePlayback({ snapshot: s }))
    act(() => result.current.seek(50))
    expect(result.current.headMs).toBe(100)
    act(() => result.current.seek(5000))
    expect(result.current.headMs).toBe(800)
    act(() => result.current.seek(400))
    expect(result.current.headMs).toBe(400)
  })

  it('play schedules every in-region note and restores the master volume', () => {
    const s = snap()
    const { result } = renderHook(() => useFreePlayback({ snapshot: s }))
    act(() => result.current.play())
    expect(engine.restoreVolume).toHaveBeenCalled()
    expect(engine.noteAtTime).toHaveBeenCalledTimes(2)
    expect(result.current.isPlaying).toBe(true)
  })

  it('scales note velocity by the containing clip volume', () => {
    const s = snap({
      notes: [note('a', 60, 0, 500)],
      clips: [{ id: 'c', startMs: 0, endMs: 1000, volume: 0.5, locked: false }],
    })
    const { result } = renderHook(() => useFreePlayback({ snapshot: s }))
    act(() => result.current.play())
    const vel = engine.noteAtTime.mock.calls[0][3]
    expect(vel).toBeCloseTo(0.5, 5)
  })

  it('play is a no-op when there are no notes to schedule', () => {
    const s = snap({ notes: [] })
    const { result } = renderHook(() => useFreePlayback({ snapshot: s }))
    act(() => result.current.play())
    expect(engine.noteAtTime).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  it('stop halts playback, mutes and restores volume', () => {
    const s = snap()
    const { result } = renderHook(() => useFreePlayback({ snapshot: s }))
    act(() => result.current.play())
    act(() => result.current.stop())
    expect(result.current.isPlaying).toBe(false)
    expect(engine.stopAll).toHaveBeenCalled()
  })

  it('a new snapshot realigns the head to its trim start', () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: FreeSnapshot }) => useFreePlayback({ snapshot: s }),
      { initialProps: { s: snap({ trimStartMs: 0 }) } },
    )
    rerender({ s: snap({ trimStartMs: 250 }) })
    expect(result.current.headMs).toBe(250)
  })
})
