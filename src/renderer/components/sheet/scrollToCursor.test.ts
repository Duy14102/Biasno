import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { scrollToCursor, resetScrollState } from './scrollToCursor'

// jsdom has no layout, so getBoundingClientRect returns zeroes. We stub the
// cursor element's rect and the scroll container's rect/metrics to drive the
// pure decision logic (threshold guard, force, distance guard, animation kick).

function rect(top: number): DOMRect {
  return { top, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

function makeScrollEl(opts: { scrollTop?: number; clientHeight?: number; scrollRectTop?: number } = {}): HTMLDivElement {
  const el = document.createElement('div')
  let st = opts.scrollTop ?? 0
  Object.defineProperty(el, 'scrollTop', { get: () => st, set: (v) => { st = v }, configurable: true })
  Object.defineProperty(el, 'clientHeight', { get: () => opts.clientHeight ?? 400, configurable: true })
  el.getBoundingClientRect = () => rect(opts.scrollRectTop ?? 0)
  return el
}

function setCursor(top: number): void {
  const c = document.createElement('div')
  c.id = 'cursorImg-0'
  c.getBoundingClientRect = () => rect(top)
  document.body.appendChild(c)
}

let rafCbs: FrameRequestCallback[]

beforeEach(() => {
  resetScrollState()
  rafCbs = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCbs.push(cb); return rafCbs.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(performance, 'now').mockReturnValue(0)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('scrollToCursor', () => {
  it('returns early when scrollEl is null', () => {
    scrollToCursor(null)
    expect(rafCbs.length).toBe(0)
  })

  it('returns early when the cursor element is absent', () => {
    const el = makeScrollEl()
    scrollToCursor(el)
    expect(rafCbs.length).toBe(0)
  })

  it('starts an animation on the first call (sentinel forces it)', () => {
    setCursor(1000) // far from scrollRect top → large targetTop
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400 })
    scrollToCursor(el)
    expect(rafCbs.length).toBe(1)
  })

  it('skips a sub-threshold move when not forced', () => {
    setCursor(1000)
    const el = makeScrollEl({ scrollTop: 0 })
    scrollToCursor(el)               // sets lastTargetTop
    rafCbs = []
    setCursor(1000)                  // re-add identical cursor (same target)
    document.body.querySelectorAll('#cursorImg-0').forEach((n, i) => { if (i === 0) n.remove() })
    scrollToCursor(el)               // same target, within threshold → skip
    expect(rafCbs.length).toBe(0)
  })

  it('force=true overrides the threshold guard', () => {
    setCursor(1000)
    const el = makeScrollEl({ scrollTop: 0 })
    scrollToCursor(el)
    rafCbs = []
    scrollToCursor(el, true)
    expect(rafCbs.length).toBe(1)
  })

  it('skips when the distance to target is below 1px', () => {
    // targetTop = max(0, contentY - clientHeight*0.25). With cursor at top 100,
    // scrollRectTop 0, scrollTop 100 → contentY=200, target=max(0,200-100)=100.
    // startTop already 100 → dist 0 → no animation.
    setCursor(100)
    const el = makeScrollEl({ scrollTop: 100, clientHeight: 400, scrollRectTop: 0 })
    scrollToCursor(el, true)
    expect(rafCbs.length).toBe(0)
  })

  it('animates scrollTop toward target and stops at progress 1', () => {
    setCursor(2000)
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400 })
    scrollToCursor(el, true)
    expect(rafCbs.length).toBe(1)
    // Drive the animation to completion (now >= DURATION 550).
    ;(performance.now as ReturnType<typeof vi.fn>).mockReturnValue(550)
    rafCbs[rafCbs.length - 1](550)
    // contentY=2000, target=max(0,2000-100)=1900, eased to 1 → scrollTop=1900
    expect(el.scrollTop).toBe(1900)
  })

  it('schedules another frame while progress < 1', () => {
    setCursor(2000)
    const el = makeScrollEl({ scrollTop: 0, clientHeight: 400 })
    scrollToCursor(el, true)
    const first = rafCbs[rafCbs.length - 1]
    ;(performance.now as ReturnType<typeof vi.fn>).mockReturnValue(100) // < 550
    const before = rafCbs.length
    first(100)
    expect(rafCbs.length).toBe(before + 1) // re-scheduled
  })
})

describe('resetScrollState', () => {
  it('cancels any in-flight raf', () => {
    setCursor(2000)
    const el = makeScrollEl({ scrollTop: 0 })
    scrollToCursor(el, true)
    resetScrollState()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
