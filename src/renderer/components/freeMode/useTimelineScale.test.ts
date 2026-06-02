import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineScale } from './useTimelineScale'

// Capture the latest ResizeObserver callback so tests can fire a resize.
let roCb: (() => void) | null = null
class FakeResizeObserver {
  constructor(cb: () => void) { roCb = cb }
  observe() {}
  disconnect() {}
}

// clientWidth is 0 in jsdom by default; override it on the prototype so the
// hook's measurement reads a real number.
let clientWidth = 800
function setClientWidth(w: number) { clientWidth = w }

beforeEach(() => {
  roCb = null
  setClientWidth(800)
  vi.stubGlobal('ResizeObserver', FakeResizeObserver as unknown as typeof ResizeObserver)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true, get() { return clientWidth },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
})

// Mount with max=0 (ref null, no measurement), attach a real node to the ref,
// then flip max to 1 so the layout effect re-runs and locks against the node.
function mountLocked(range = 1000) {
  const node = document.createElement('div')
  const r = renderHook(
    ({ range, max }) => useTimelineScale(range, max),
    { initialProps: { range, max: 0 } },
  )
  ;(r.result.current.containerRef as { current: HTMLDivElement }).current = node
  act(() => r.rerender({ range, max: 1 }))
  return r
}

describe('useTimelineScale', () => {
  it('max <= 0 → unlocked: floor px/ms, no track width, min-width 100%', () => {
    const { result } = renderHook(() => useTimelineScale(1000, 0))
    expect(result.current.pxPerMs).toBe(0.1)
    expect(result.current.trackPx).toBe(0)
    expect(result.current.scaledMinWidth).toBe('100%')
  })

  it('locks px/ms from the first non-empty measurement', () => {
    const { result } = mountLocked(1000)
    // 800px / 1000ms = 0.8 px/ms (above the 0.1 floor)
    expect(result.current.pxPerMs).toBeCloseTo(0.8, 5)
    expect(result.current.trackPx).toBeCloseTo(800, 1)
    expect(result.current.scaledMinWidth).toBe(`${800}px`)
  })

  it('applies the floor when the container is tiny relative to range', () => {
    setClientWidth(10)
    const { result } = mountLocked(1000)
    // 10/1000 = 0.01 < floor 0.1 → floor wins
    expect(result.current.pxPerMs).toBe(0.1)
  })

  it('does not relock once locked (range extends, px/ms held)', () => {
    const { result, rerender } = mountLocked(1000)
    const locked = result.current.pxPerMs
    act(() => rerender({ range: 5000, max: 1 }))   // recording grows
    expect(result.current.pxPerMs).toBe(locked)    // px/ms unchanged
    expect(result.current.trackPx).toBeCloseTo(5000 * locked, 1)
  })

  it('a container GROW via ResizeObserver bumps px/ms up', () => {
    const { result } = mountLocked(1000)            // lock at 0.8 (baseline 1000)
    setClientWidth(2000)                            // container grew
    act(() => { roCb?.() })
    // desired 2000/1000 = 2.0 > 0.8 → bump up
    expect(result.current.pxPerMs).toBeCloseTo(2.0, 5)
  })

  it('a container SHRINK via ResizeObserver leaves the lock alone', () => {
    const { result } = mountLocked(1000)
    const locked = result.current.pxPerMs
    setClientWidth(400)                             // shrink
    act(() => { roCb?.() })
    expect(result.current.pxPerMs).toBe(locked)     // desired 0.4 < 0.8 → unchanged
  })

  it('max dropping to 0 releases the lock', () => {
    const { result, rerender } = mountLocked(1000)
    expect(result.current.pxPerMs).toBeCloseTo(0.8, 5)
    act(() => rerender({ range: 1000, max: 0 }))    // Clear
    expect(result.current.pxPerMs).toBe(0.1)        // back to floor
    expect(result.current.trackPx).toBe(0)
  })
})
