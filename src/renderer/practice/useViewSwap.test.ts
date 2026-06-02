import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewSwap } from './useViewSwap'

afterEach(() => vi.useRealTimers())

describe('useViewSwap', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useViewSwap())
    expect(result.current.phase).toBe('idle')
  })

  it('runs leaving → entering → idle with the mutation fired at the swap point', () => {
    vi.useFakeTimers()
    const mutation = vi.fn()
    const { result } = renderHook(() => useViewSwap())

    act(() => { result.current.beginSwap(mutation) })
    expect(result.current.phase).toBe('leaving')
    expect(mutation).not.toHaveBeenCalled()

    // leaving → entering at 220 ms; mutation runs at the swap point.
    act(() => { vi.advanceTimersByTime(220) })
    expect(result.current.phase).toBe('entering')
    expect(mutation).toHaveBeenCalledTimes(1)

    // entering → idle at 460 ms.
    act(() => { vi.advanceTimersByTime(460) })
    expect(result.current.phase).toBe('idle')
  })

  it('ignores beginSwap while a swap is already in flight', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const { result } = renderHook(() => useViewSwap())

    act(() => { result.current.beginSwap(first) })
    act(() => { result.current.beginSwap(second) })   // no-op, phase !== idle

    act(() => { vi.advanceTimersByTime(220) })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('clears the leaving timeout on unmount before it fires (no mutation)', () => {
    vi.useFakeTimers()
    const mutation = vi.fn()
    const { result, unmount } = renderHook(() => useViewSwap())
    act(() => { result.current.beginSwap(mutation) })
    unmount()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(mutation).not.toHaveBeenCalled()
  })
})
