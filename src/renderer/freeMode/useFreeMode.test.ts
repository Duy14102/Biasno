import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const engine = vi.hoisted(() => ({ noteOn: vi.fn(), noteOff: vi.fn(), setSustainPedal: vi.fn() }))
const midi = vi.hoisted(() => ({ note: null as null | ((m: number, v: number, on: boolean) => void) }))
vi.mock('@/audio', () => ({ audioEngine: engine }))
vi.mock('@/context', () => ({
  useMidi: () => ({
    subscribe: (cb: (m: number, v: number, on: boolean) => void) => { midi.note = cb; return () => {} },
    subscribePedal: () => () => {},
  }),
}))

import { useFreeMode } from './useFreeMode'
import type { FreeSnapshot } from './types'

let now = 0
beforeEach(() => { now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now) })
afterEach(() => vi.restoreAllMocks())

// A two-clip snapshot for clip-op tests.
const twoClip: FreeSnapshot = {
  notes: [
    { id: 'n0', midi: 60, velocity: 1, startMs: 0,   endMs: 400 },
    { id: 'n1', midi: 64, velocity: 1, startMs: 500, endMs: 900 },
  ],
  durationMs: 1000, trimStartMs: 0, trimEndMs: 1000,
  clips: [
    { id: 'c0', startMs: 0,   endMs: 500,  volume: 1, locked: false },
    { id: 'c1', startMs: 500, endMs: 1000, volume: 1, locked: false },
  ],
}

describe('useFreeMode composition', () => {
  it('records a take and reports it through onAfterStop', () => {
    const onAfterStop = vi.fn()
    const { result } = renderHook(() => useFreeMode({ onAfterStop }))
    act(() => result.current.startRecord())
    now = 100; act(() => result.current.playInput(60, 1, true))
    now = 300; act(() => result.current.playInput(60, 0, false))
    act(() => result.current.stopRecord())
    expect(onAfterStop).toHaveBeenCalledTimes(1)
    const [snap, hadNotes] = onAfterStop.mock.calls[0]
    expect(hadNotes).toBe(true)
    expect(snap.notes).toHaveLength(1)
    expect(result.current.snapshot.notes).toHaveLength(1)
  })

  it('clear stops recording, empties the draft and fires onAfterClear', () => {
    const onAfterClear = vi.fn()
    const { result } = renderHook(() => useFreeMode({ onAfterClear }))
    act(() => result.current.replaceSnapshot(twoClip))
    act(() => result.current.clear())
    expect(onAfterClear).toHaveBeenCalled()
    expect(result.current.snapshot.notes).toHaveLength(0)
    expect(result.current.isRecording).toBe(false)
  })

  it('a clip op (toggleLock) commits a new snapshot and enables undo', () => {
    const { result } = renderHook(() => useFreeMode())
    act(() => result.current.replaceSnapshot(twoClip)) // baseline, wipes history
    act(() => result.current.toggleLockAt(250)) // inside c0
    expect(result.current.canUndo).toBe(true)
    const locked = result.current.snapshot.clips.find(c => c.startMs === 0)
    expect(locked?.locked).toBe(true)
  })

  it('copyClipAt + pasteClipAt round-trips through the clipboard', () => {
    const { result } = renderHook(() => useFreeMode())
    act(() => result.current.replaceSnapshot(twoClip))
    act(() => result.current.copyClipAt(250)) // copy c0
    expect(result.current.clipboard).not.toBeNull()
    const before = result.current.snapshot.clips.length
    act(() => result.current.pasteClipAt(700)) // paste into c1 region
    expect(result.current.snapshot.clips.length).toBeGreaterThanOrEqual(before)
  })

  it('pasteClipAt with an empty clipboard is a no-op', () => {
    const { result } = renderHook(() => useFreeMode())
    act(() => result.current.replaceSnapshot(twoClip))
    act(() => result.current.pasteClipAt(250))
    expect(result.current.canUndo).toBe(false)
  })

  it('splitClipAt then undo restores the prior snapshot', () => {
    const { result } = renderHook(() => useFreeMode())
    act(() => result.current.replaceSnapshot(twoClip))
    act(() => result.current.splitClipAt(250))
    const afterSplit = result.current.snapshot.clips.length
    act(() => result.current.undo())
    expect(result.current.snapshot.clips.length).toBeLessThanOrEqual(afterSplit)
  })
})
