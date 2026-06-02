import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import {
  useClipDrag, detectDropSlot, computePreviewPositions, computePlaceholderRange,
} from './useClipDrag'
import type { Clip } from '@/freeMode'

const clip = (id: string, startMs: number, endMs: number, o: Partial<Clip> = {}): Clip =>
  ({ id, startMs, endMs, volume: 1, locked: false, ...o })

describe('detectDropSlot', () => {
  it('returns 0 when no other clips remain', () => {
    expect(detectDropSlot([clip('a', 0, 100)], 'a', 50)).toBe(0)
  })

  it('returns 0 when cursor is left of the first remaining clip', () => {
    const clips = [clip('a', 0, 100), clip('b', 200, 300)]
    expect(detectDropSlot(clips, 'a', 150)).toBe(0)
  })

  it('inside a clip, left of midpoint → before it', () => {
    const clips = [clip('a', 0, 100), clip('b', 200, 400)]
    expect(detectDropSlot(clips, 'a', 250)).toBe(0)   // 250 < mid 300
  })

  it('inside a clip, right of midpoint → after it', () => {
    const clips = [clip('a', 0, 100), clip('b', 200, 400)]
    expect(detectDropSlot(clips, 'a', 350)).toBe(1)   // 350 > mid 300
  })

  it('in a gap between two clips → after the left one', () => {
    const clips = [clip('drag', 0, 50), clip('b', 100, 200), clip('c', 400, 500)]
    expect(detectDropSlot(clips, 'drag', 300)).toBe(1)
  })

  it('right of the last clip → N', () => {
    const clips = [clip('drag', 0, 50), clip('b', 100, 200)]
    expect(detectDropSlot(clips, 'drag', 999)).toBe(1)
  })
})

describe('computePreviewPositions', () => {
  it('returns an empty map when dropSlot is null', () => {
    const clips = [clip('a', 0, 100), clip('b', 100, 200)]
    expect(computePreviewPositions(clips, 'x', 50, null, 0).size).toBe(0)
  })

  it('pushes clips after the drop slot rightward by the dragged width', () => {
    // remaining b[0,100], c[100,200]; slot 0 inserts a 100ms gap before b.
    const clips = [clip('drag', 500, 600), clip('b', 0, 100), clip('c', 100, 200)]
    const out = computePreviewPositions(clips, 'drag', 100, 0, 0)
    expect(out.get('b')).toBe(100)   // b shifted from 0 → 100
    expect(out.get('c')).toBe(200)   // c shifted from 100 → 200
  })

  it('leaves clips before the slot at their original positions', () => {
    const clips = [clip('drag', 500, 600), clip('b', 0, 100), clip('c', 100, 200)]
    const out = computePreviewPositions(clips, 'drag', 100, 1, 0)
    // remaining sorted: b[0,100], c[100,200]; slot 1 → gap after b
    expect(out.has('b')).toBe(false)        // b stays at 0
    expect(out.get('c')).toBe(200)          // c shifted by 100
  })
})

describe('computePlaceholderRange', () => {
  it('slot 0 → placeholder at trimStart', () => {
    const clips = [clip('drag', 500, 600), clip('b', 0, 100)]
    expect(computePlaceholderRange(clips, 'drag', 100, 0, 0)).toEqual({ startMs: 0, endMs: 100 })
  })

  it('slot 1 → placeholder after first remaining clip width', () => {
    const clips = [clip('drag', 500, 650), clip('b', 0, 100), clip('c', 100, 300)]
    // before slot 1: b width 100 → cursor 100
    expect(computePlaceholderRange(clips, 'drag', 150, 1, 0)).toEqual({ startMs: 100, endMs: 250 })
  })

  it('honours the trimStart offset', () => {
    const clips = [clip('drag', 999, 1099), clip('b', 0, 100)]
    expect(computePlaceholderRange(clips, 'drag', 100, 0, 500)).toEqual({ startMs: 500, endMs: 600 })
  })
})

describe('useClipDrag — gesture pump', () => {
  let scrollEl: HTMLElement

  beforeEach(() => {
    scrollEl = document.createElement('div')
    Object.defineProperty(scrollEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 1000, top: 0, bottom: 100, width: 1000, height: 100 }),
      configurable: true,
    })
    document.body.appendChild(scrollEl)
    vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => { return 1 as unknown as number })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    scrollEl.remove()
    vi.unstubAllGlobals()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  const setup = (clips: Clip[], onDrop = vi.fn()) => {
    const ref = createRef<HTMLElement>()
    ;(ref as { current: HTMLElement }).current = scrollEl
    const msAtClientX = (x: number) => x   // 1px = 1ms for easy assertions
    const hook = renderHook(() =>
      useClipDrag({ msAtClientX, scrollContainer: ref, clips, onDrop }))
    return { hook, onDrop }
  }

  const mouseEvt = (type: string, clientX: number, clientY = 0) =>
    new MouseEvent(type, { clientX, clientY, bubbles: true })

  it('ignores non-left buttons', () => {
    const { hook } = setup([clip('a', 0, 100)])
    const e = { button: 1, clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.beginDragMaybe(e as never, clip('a', 0, 100)))
    expect(hook.result.current.state).toBe(null)
  })

  it('ignores locked clips', () => {
    const { hook } = setup([clip('a', 0, 100, { locked: true })])
    const e = { button: 0, clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.beginDragMaybe(e as never, clip('a', 0, 100, { locked: true })))
    expect(hook.result.current.state).toBe(null)
  })

  it('a click below threshold fires the fallback, not a drag/drop', () => {
    const onDrop = vi.fn()
    const fallback = vi.fn()
    const { hook } = setup([clip('a', 0, 100), clip('b', 200, 300)], onDrop)
    const e = { button: 0, clientX: 50, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.beginDragMaybe(e as never, clip('a', 0, 100), fallback))
    act(() => { window.dispatchEvent(mouseEvt('mousemove', 52)) })   // dx=2 < 4
    act(() => { window.dispatchEvent(mouseEvt('mouseup', 52)) })
    expect(hook.result.current.state).toBe(null)
    expect(fallback).toHaveBeenCalledWith(52)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('movement past threshold starts a drag and sets state', () => {
    const { hook } = setup([clip('drag', 0, 100), clip('b', 200, 400)])
    const e = { button: 0, clientX: 50, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.beginDragMaybe(e as never, clip('drag', 0, 100)))
    act(() => { window.dispatchEvent(mouseEvt('mousemove', 250)) })  // dx=200 > 4
    expect(hook.result.current.state).not.toBe(null)
    expect(hook.result.current.state?.clipId).toBe('drag')
    expect(hook.result.current.state?.widthMs).toBe(100)
    expect(document.body.style.cursor).toBe('grabbing')
  })

  it('drop calls onDrop with the final slot and clears state', () => {
    const onDrop = vi.fn()
    const { hook } = setup([clip('drag', 0, 100), clip('b', 200, 400)], onDrop)
    const e = { button: 0, clientX: 50, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.beginDragMaybe(e as never, clip('drag', 0, 100)))
    act(() => { window.dispatchEvent(mouseEvt('mousemove', 350)) })  // inside b, right of mid → slot 1
    act(() => { window.dispatchEvent(mouseEvt('mouseup', 350)) })
    expect(onDrop).toHaveBeenCalledWith('drag', 1)
    expect(hook.result.current.state).toBe(null)
    expect(document.body.style.cursor).toBe('')
  })

  it('cleanup on unmount resets the body cursor', () => {
    const { hook } = setup([clip('drag', 0, 100), clip('b', 200, 400)])
    const e = { button: 0, clientX: 50, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.beginDragMaybe(e as never, clip('drag', 0, 100)))
    act(() => { window.dispatchEvent(mouseEvt('mousemove', 250)) })
    hook.unmount()
    expect(document.body.style.cursor).toBe('')
  })
})
