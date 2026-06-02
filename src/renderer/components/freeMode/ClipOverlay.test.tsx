import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import React from 'react'
import type { Clip } from '@/freeMode'
import ClipOverlay from './ClipOverlay'

const baseClip: Clip = { id: 'c1', startMs: 0, endMs: 1000, volume: 1, locked: false }

type P = React.ComponentProps<typeof ClipOverlay>
function setup(props: Partial<P> = {}) {
  const onMouseDown = vi.fn()
  const full: P = {
    clip: baseClip, leftPct: 0, widthPct: 50, selected: false, draggable: false,
    isBeingDragged: false, dragTranslatePx: 0, offsetMsToView: 0, range: 1000,
    pxPerMs: 1, anyDragging: false, onMouseDown,
    ...props,
  }
  const utils = render(<ClipOverlay {...full} />)
  return { onMouseDown, root: utils.container.firstElementChild as HTMLElement, ...utils }
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('ClipOverlay', () => {
  it('forwards mousedown to onMouseDown', () => {
    const { onMouseDown, root } = setup()
    fireEvent.mouseDown(root)
    expect(onMouseDown).toHaveBeenCalledTimes(1)
  })

  it('uses the drag transform + grabbing cursor while being dragged', () => {
    const { root } = setup({ isBeingDragged: true, dragTranslatePx: 42 })
    expect(root.style.transform).toContain('translate3d(42px, 0, 0)')
    expect(root.style.transform).toContain('rotate(0.6deg)')
    expect(root.style.cursor).toBe('grabbing')
    expect(root.style.transition).toBe('none')
  })

  it('uses translateX from offset when not dragged but offset is non-zero', () => {
    const { root } = setup({ offsetMsToView: 10, pxPerMs: 2 })
    expect(root.style.transform).toBe('translateX(20px)')
  })

  it('leaves transform unset when offset is zero and not dragged', () => {
    const { root } = setup({ offsetMsToView: 0 })
    expect(root.style.transform).toBe('')
  })

  it('applies the animated transition while another clip is dragging', () => {
    const { root } = setup({ anyDragging: true })
    expect(root.style.transition).toContain('transform 220ms')
  })

  it('shows grab cursor when draggable, pointer when not', () => {
    expect(setup({ draggable: true }).root.style.cursor).toBe('grab')
    cleanup()
    expect(setup({ draggable: false }).root.style.cursor).toBe('pointer')
  })

  it('shows not-allowed cursor + LOCK badge + amber ring when locked', () => {
    const { root, getByText } = setup({ clip: { ...baseClip, locked: true } })
    expect(root.style.cursor).toBe('not-allowed')
    expect(getByText('LOCK')).toBeTruthy()
    expect(root.className).toContain('ring-amber-400/80')
  })

  it('applies the cyan selected ring (taking precedence over lock)', () => {
    const { root } = setup({ selected: true, clip: { ...baseClip, locked: true } })
    expect(root.className).toContain('ring-cyan-300')
  })

  it('renders the volume badge only when volume != 100%', () => {
    const { queryByText } = setup({ clip: { ...baseClip, volume: 1 } })
    expect(queryByText('100%')).toBeNull()
    cleanup()
    const { getByText } = setup({ clip: { ...baseClip, volume: 1.5 } })
    expect(getByText('150%')).toBeTruthy()
  })

  it('renders a comment bubble only when a comment exists', () => {
    const { container } = setup({ clip: { ...baseClip, comment: 'hi' } })
    expect(container.querySelector('.fm-comment-bubble')).toBeTruthy()
    cleanup()
    const { container: c2 } = setup()
    expect(c2.querySelector('.fm-comment-bubble')).toBeNull()
  })

  it('enables the marquee on hover when text overflows the wrapper', () => {
    vi.useFakeTimers()
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 500 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 50 })
    const { container } = setup({ clip: { ...baseClip, comment: 'long text here' } })
    const bubble = container.querySelector('.fm-comment-bubble') as HTMLElement
    fireEvent.mouseEnter(bubble)
    act(() => { vi.advanceTimersByTime(400) })
    // marquee adds a second aria-hidden <span> duplicate carrying the text
    const dup = Array.from(container.querySelectorAll('span[aria-hidden]'))
      .filter(s => s.textContent === 'long text here')
    expect(dup.length).toBe(1)
    fireEvent.mouseLeave(bubble)
    // leaving clears marquee synchronously (no timer) → duplicate gone
    expect(
      Array.from(container.querySelectorAll('span[aria-hidden]'))
        .filter(s => s.textContent === 'long text here').length,
    ).toBe(0)
  })

  it('does NOT enable marquee when text fits the wrapper', () => {
    vi.useFakeTimers()
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 20 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 200 })
    const { container } = setup({ clip: { ...baseClip, comment: 'hi' } })
    const bubble = container.querySelector('.fm-comment-bubble') as HTMLElement
    fireEvent.mouseEnter(bubble)
    act(() => { vi.advanceTimersByTime(400) })
    const dup = Array.from(container.querySelectorAll('span[aria-hidden]'))
      .filter(s => s.textContent === 'hi')
    expect(dup.length).toBe(0)
  })
})
