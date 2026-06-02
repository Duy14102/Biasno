import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlashTimer } from './useFlashTimer'
import type { NoteState } from './noteState'
import type { MidiNote } from '@/types'

const note = (id: string): MidiNote => ({
  id, midi: 60, time: 0, duration: 1, velocity: 0.8, name: 'C4', track: 0, hand: 'right', channel: 0,
})

const ns = (id: string): NoteState => ({
  note: note(id), visual: 'pending', flashAlpha: 0, scheduled: false,
})

// A tiny stateful harness mirroring how the page holds noteStates in React.
function harness(initial: Array<string>) {
  let map = new Map<string, NoteState>(initial.map(id => [id, ns(id)]))
  const setNoteStates = vi.fn((u: Map<string, NoteState> | ((m: Map<string, NoteState>) => Map<string, NoteState>)) => {
    map = typeof u === 'function' ? u(map) : u
  })
  return { get map() { return map }, setNoteStates }
}

afterEach(() => vi.useRealTimers())

describe('useFlashTimer', () => {
  it('sets visual + flashAlpha=1 on trigger and fires the matching scoring hook (hit)', () => {
    vi.useFakeTimers()
    const h = harness(['n1'])
    const onHit = vi.fn()
    const onMissed = vi.fn()
    const { result } = renderHook(() =>
      useFlashTimer({ setNoteStates: h.setNoteStates, onHit, onMissed }))

    act(() => { result.current.triggerFlash('n1', 'hit') })
    expect(onHit).toHaveBeenCalledWith('n1')
    expect(onMissed).not.toHaveBeenCalled()
    expect(h.map.get('n1')).toMatchObject({ visual: 'hit', flashAlpha: 1.0 })
  })

  it('fires onMissed (not onHit) for a missed flash', () => {
    vi.useFakeTimers()
    const h = harness(['n1'])
    const onHit = vi.fn()
    const onMissed = vi.fn()
    const { result } = renderHook(() =>
      useFlashTimer({ setNoteStates: h.setNoteStates, onHit, onMissed }))
    act(() => { result.current.triggerFlash('n1', 'missed') })
    expect(onMissed).toHaveBeenCalledWith('n1')
    expect(onHit).not.toHaveBeenCalled()
    expect(h.map.get('n1')?.visual).toBe('missed')
  })

  it('works without optional scoring hooks (no throw)', () => {
    vi.useFakeTimers()
    const h = harness(['n1'])
    const { result } = renderHook(() => useFlashTimer({ setNoteStates: h.setNoteStates }))
    expect(() => act(() => { result.current.triggerFlash('n1', 'hit') })).not.toThrow()
  })

  it('decays flashAlpha each tick then settles at 0 and clears the timer', () => {
    vi.useFakeTimers()
    const h = harness(['n1'])
    const { result } = renderHook(() => useFlashTimer({ setNoteStates: h.setNoteStates }))
    act(() => { result.current.triggerFlash('n1', 'hit') })

    act(() => { vi.advanceTimersByTime(28) })            // one tick → 0.9
    expect(h.map.get('n1')?.flashAlpha).toBeCloseTo(0.9, 5)

    act(() => { vi.advanceTimersByTime(28 * 20) })        // run to completion
    expect(h.map.get('n1')?.flashAlpha).toBe(0)
    // Interval cleared: further time does not change state.
    const calls = h.setNoteStates.mock.calls.length
    act(() => { vi.advanceTimersByTime(28 * 10) })
    expect(h.setNoteStates.mock.calls.length).toBe(calls)
  })

  it('re-triggering the same note clears the in-flight interval (no alpha pile-up)', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const h = harness(['n1'])
    const { result } = renderHook(() => useFlashTimer({ setNoteStates: h.setNoteStates }))
    act(() => { result.current.triggerFlash('n1', 'hit') })
    act(() => { vi.advanceTimersByTime(28) })             // alpha 0.9
    clearSpy.mockClear()
    act(() => { result.current.triggerFlash('n1', 'hit') })  // existing → clearInterval
    expect(clearSpy).toHaveBeenCalled()
    expect(h.map.get('n1')?.flashAlpha).toBe(1.0)         // reset, not 0.8
    clearSpy.mockRestore()
  })

  it('tick aborts when the note id vanishes from the map mid-decay', () => {
    vi.useFakeTimers()
    const h = harness(['n1'])
    const { result } = renderHook(() => useFlashTimer({ setNoteStates: h.setNoteStates }))
    act(() => { result.current.triggerFlash('n1', 'hit') })
    // Drop the note before the next tick — the `if (!ns)` branch returns prev.
    h.setNoteStates(new Map())
    expect(() => act(() => { vi.advanceTimersByTime(28 * 3) })).not.toThrow()
    expect(h.map.size).toBe(0)
  })

  it('clears every running interval on unmount', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const h = harness(['n1', 'n2'])
    const { result, unmount } = renderHook(() => useFlashTimer({ setNoteStates: h.setNoteStates }))
    act(() => { result.current.triggerFlash('n1', 'hit') })
    act(() => { result.current.triggerFlash('n2', 'missed') })
    clearSpy.mockClear()
    unmount()
    expect(clearSpy).toHaveBeenCalledTimes(2)
    clearSpy.mockRestore()
  })
})
