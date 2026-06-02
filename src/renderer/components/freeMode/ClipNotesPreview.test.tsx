import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import type { Clip, RecordedNote } from '@/freeMode'
import ClipNotesPreview from './ClipNotesPreview'

// The @/freeMode barrel re-exports useFreePlayback → @/audio → tone, which
// fails to resolve under vitest. Stub @/audio so the real chunkEndAt (pure,
// from clipOps) still loads through the barrel.
vi.mock('@/audio', () => ({ audioEngine: {}, sustainedEnd: () => 0 }))

// jsdom has no canvas; install a recording 2D context stub and deterministic
// element geometry so paint() exercises its branches and we can read back the
// styling decisions (fill/stroke per clip/note).
let ctx: ReturnType<typeof makeCtx>
function makeCtx(withRoundRect: boolean) {
  return {
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), rect: vi.fn(),
    beginPath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), fillText: vi.fn(),
    ...(withRoundRect ? { roundRect: vi.fn() } : {}),
    set fillStyle(v: string) { this._fills.push(v) },
    get fillStyle() { return '' },
    set strokeStyle(v: string) { this._strokes.push(v) },
    get strokeStyle() { return '' },
    lineWidth: 0, font: '', textBaseline: '',
    _fills: [] as string[], _strokes: [] as string[],
  }
}

function pinSize(w = 200, h = 100) {
  vi.spyOn(HTMLDivElement.prototype, 'clientWidth', 'get').mockReturnValue(w)
  vi.spyOn(HTMLDivElement.prototype, 'clientHeight', 'get').mockReturnValue(h)
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: w, width: w, top: 0, bottom: h, height: h, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
}

beforeEach(() => {
  ctx = makeCtx(true)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D)
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} }
  pinSize()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const notes: RecordedNote[] = [
  { midi: 60, velocity: 0.9, startMs: 0,   endMs: 500 } as RecordedNote,
  { midi: 48, velocity: 0.2, startMs: 200, endMs: 900 } as RecordedNote,
]
const clips: Clip[] = [
  { id: 'a', startMs: 0,   endMs: 500,  volume: 1, locked: false },
  { id: 'b', startMs: 500, endMs: 1000, volume: 1, locked: true },
]

type P = React.ComponentProps<typeof ClipNotesPreview>
function setup(props: Partial<P> = {}) {
  const onSeek = vi.fn()
  const full: P = {
    notes, clips, durationMs: 1000, selectedClipId: null, onSeek,
    showMeasureLines: false, ...props,
  }
  const utils = render(<ClipNotesPreview {...full} />)
  const hit = utils.container.firstElementChild as HTMLElement
  return { onSeek, hit, ...utils }
}

describe('ClipNotesPreview', () => {
  it('paints body tints, notes and outlines without throwing', () => {
    setup()
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
    // clip body tint fill present
    expect(ctx._fills).toContain('rgba(99, 102, 241, 0.10)')
  })

  it('bails before drawing when there are no clips', () => {
    setup({ clips: [] })
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('bails when durationMs <= 0', () => {
    setup({ durationMs: 0 })
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('uses the neutral stroke for an unselected unlocked clip and amber for locked', () => {
    setup({ selectedClipId: null })
    expect(ctx._strokes).toContain('rgba(148, 163, 184, 0.55)') // neutral (clip a)
    expect(ctx._strokes).toContain('rgba(251, 191, 36, 0.70)')  // amber (clip b locked)
  })

  it('uses the cyan stroke for the selected clip', () => {
    setup({ selectedClipId: 'a' })
    expect(ctx._strokes).toContain('rgba(103, 232, 249, 0.85)')
  })

  it('draws octave labels + black-key bands when showMeasureLines is on', () => {
    setup({ showMeasureLines: true })
    expect(ctx.fillText).toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalled()
  })

  it('does not draw measure guides when showMeasureLines is off', () => {
    setup({ showMeasureLines: false })
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('falls back to fillRect/rect when roundRect is unavailable', () => {
    ctx = makeCtx(false)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D)
    setup()
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.rect).toHaveBeenCalled()
  })

  it('seeks to the clicked fraction of duration', () => {
    const { onSeek, hit } = setup()
    fireEvent.click(hit, { clientX: 100 }) // 0.5 * 1000
    expect(onSeek).toHaveBeenCalledWith(500)
  })

  it('clamps the seek ratio at the right edge', () => {
    const { onSeek, hit } = setup()
    fireEvent.click(hit, { clientX: 9999 })
    expect(onSeek).toHaveBeenCalledWith(1000)
  })

  it('is a no-op click when no onSeek is provided', () => {
    const { hit } = setup({ onSeek: undefined })
    expect(() => fireEvent.click(hit, { clientX: 50 })).not.toThrow()
  })

  it('handles an empty notes set (default pitch range, no note fills thrown)', () => {
    expect(() => setup({ notes: [] })).not.toThrow()
    // still paints clip tints + outlines
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('skips notes whose audible window collapses to zero', () => {
    // a note entirely inside a gap after the last clip -> chunkEndAt null -> uses endMs,
    // but placed past all clips so the per-clip overlap loop draws nothing extra.
    const zero: RecordedNote[] = [{ midi: 64, velocity: 1, startMs: 1000, endMs: 1000 } as RecordedNote]
    expect(() => setup({ notes: zero })).not.toThrow()
  })
})
