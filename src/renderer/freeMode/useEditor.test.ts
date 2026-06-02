import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditor, EMPTY_SNAPSHOT } from './useEditor'
import type { Clip, FreeSnapshot } from './types'

const snap = (over: Partial<FreeSnapshot> = {}): FreeSnapshot => ({
  notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0, clips: [], ...over,
})
const clip = (id: string): Clip => ({ id, startMs: 0, endMs: 100, volume: 1, locked: false })

describe('useEditor', () => {
  it('starts on the initial snapshot with empty history', () => {
    const { result } = renderHook(() => useEditor())
    expect(result.current.snapshot).toBe(EMPTY_SNAPSHOT)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('apply commits a new snapshot and enables undo', () => {
    const next = snap({ durationMs: 5 })
    const { result } = renderHook(() => useEditor())
    act(() => result.current.apply(() => next))
    expect(result.current.snapshot).toBe(next)
    expect(result.current.canUndo).toBe(true)
  })

  it('apply skips the commit when the transformer returns the same snapshot', () => {
    const { result } = renderHook(() => useEditor())
    act(() => result.current.apply((s) => s)) // identity = no-op
    expect(result.current.canUndo).toBe(false)
  })

  it('undo restores the previous snapshot and enables redo', () => {
    // Two edits so the undo lands on b1 (not the baseline, which would collapse).
    const { result } = renderHook(() => useEditor(snap({ durationMs: 1 })))
    const b1 = snap({ durationMs: 2 })
    const b2 = snap({ durationMs: 3 })
    act(() => result.current.apply(() => b1))
    act(() => result.current.apply(() => b2))
    act(() => result.current.undo())
    expect(result.current.snapshot).toBe(b1)
    expect(result.current.canRedo).toBe(true)
  })

  it('redo re-applies an undone snapshot', () => {
    const { result } = renderHook(() => useEditor(snap({ durationMs: 1 })))
    const b1 = snap({ durationMs: 2 })
    const b2 = snap({ durationMs: 3 })
    act(() => result.current.apply(() => b1))
    act(() => result.current.apply(() => b2))
    act(() => result.current.undo())
    act(() => result.current.redo())
    expect(result.current.snapshot).toBe(b2)
  })

  it('undo / redo are no-ops on empty stacks', () => {
    const { result } = renderHook(() => useEditor())
    act(() => result.current.undo())
    act(() => result.current.redo())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('reset wipes history and installs the new baseline', () => {
    const { result } = renderHook(() => useEditor())
    act(() => result.current.apply(() => snap({ durationMs: 9 })))
    const fresh = snap({ durationMs: 100 })
    act(() => result.current.reset(fresh))
    expect(result.current.snapshot).toMatchObject({ durationMs: 100 })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('reset normalises a missing clips array to []', () => {
    const { result } = renderHook(() => useEditor())
    act(() => result.current.reset({ notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0 } as unknown as FreeSnapshot))
    expect(result.current.snapshot.clips).toEqual([])
  })

  it('collapses history when an edit returns to the baseline (trim+clips ref-equal)', () => {
    const base = snap({ durationMs: 10 })
    const { result } = renderHook(() => useEditor(base))
    const edited = snap({ durationMs: 10, trimStartMs: 3, notes: base.notes, clips: base.clips })
    act(() => result.current.apply(() => edited))
    expect(result.current.canUndo).toBe(true)
    // Apply a snapshot that matches the baseline on trim + clips identity.
    act(() => result.current.apply(() => ({ ...edited, trimStartMs: base.trimStartMs, trimEndMs: base.trimEndMs, clips: base.clips, notes: base.notes })))
    expect(result.current.canUndo).toBe(false)
  })

  it('copyClip stores a copy on the clipboard', () => {
    const { result } = renderHook(() => useEditor())
    const c = clip('a')
    act(() => result.current.copyClip(c))
    expect(result.current.clipboard).toEqual(c)
    expect(result.current.clipboard).not.toBe(c) // copied, not same ref
  })
})
