import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import React from 'react'
import VirtualFileList, { FILE_ROW_HEIGHT } from './VirtualFileList'

// jsdom never lays out: clientHeight is 0 and rAF is async. Pin a viewport
// height and make rAF synchronous so scroll updates commit deterministically.
function pinViewport(height: number) {
  vi.spyOn(HTMLDivElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 1
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))

function setup(viewportH = 280) {
  pinViewport(viewportH)
  const utils = render(
    <VirtualFileList
      items={items}
      rowKey={(it) => it.id}
      renderRow={(it) => <span>{it.name}</span>}
      className="scroll-box"
    />,
  )
  const scroller = utils.container.querySelector('.scroll-box') as HTMLElement
  return { scroller, ...utils }
}

describe('VirtualFileList', () => {
  it('renders only the windowed rows near the top on mount', () => {
    const { container } = setup(280)
    // scrollTop=0: start=0, end=ceil(280/56)+6 = 5+6 = 11 -> rows 0..10
    const rendered = container.querySelectorAll('[role="listitem"]')
    expect(rendered.length).toBe(11)
    expect(container.textContent).toContain('Row 0')
    expect(container.textContent).toContain('Row 10')
    expect(container.textContent).not.toContain('Row 11')
    // Far-off row absent.
    expect(container.textContent).not.toContain('Row 50')
  })

  it('sizes the spacer to the full virtual height', () => {
    const { container } = setup(280)
    const spacer = container.querySelector('[role="list"]') as HTMLElement
    expect(spacer.style.height).toBe(`${100 * FILE_ROW_HEIGHT}px`)
  })

  it('shifts the rendered window and offset on scroll', () => {
    const { scroller, container } = setup(280)
    // Scroll to 2800px: start = floor(2800/56)-6 = 50-6 = 44.
    Object.defineProperty(scroller, 'scrollTop', { value: 2800, configurable: true })
    act(() => { fireEvent.scroll(scroller) })

    expect(container.textContent).toContain('Row 44')
    expect(container.textContent).not.toContain('Row 43')
    const offset = container.querySelector('[role="list"] > div') as HTMLElement
    expect(offset.style.transform).toBe(`translateY(${44 * FILE_ROW_HEIGHT}px)`)
  })

  it('clamps end to items.length when scrolled to the bottom', () => {
    const { scroller, container } = setup(280)
    Object.defineProperty(scroller, 'scrollTop', { value: 100 * FILE_ROW_HEIGHT, configurable: true })
    act(() => { fireEvent.scroll(scroller) })
    // Last item must render, and no row index >= 100 exists.
    expect(container.textContent).toContain('Row 99')
    expect(container.textContent).not.toContain('Row 100')
  })

  it('coalesces scroll events within a frame (one render per rAF)', () => {
    // Make rAF defer instead of running synchronously, so a second scroll
    // while one is pending is dropped (rafRef guard).
    const cbs: FrameRequestCallback[] = []
    vi.mocked(window.requestAnimationFrame).mockImplementation((cb) => {
      cbs.push(cb)
      return cbs.length
    })
    const { scroller } = setup(280)
    Object.defineProperty(scroller, 'scrollTop', { value: 560, configurable: true })
    fireEvent.scroll(scroller)
    fireEvent.scroll(scroller)
    // Only one frame queued despite two scroll events.
    expect(cbs.length).toBe(1)
  })
})
