import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

let theme: 'dark' | 'light' = 'dark'
vi.mock('@/context', () => ({ useTheme: () => ({ theme }) }))

import FallingNotes, { type NoteRenderState } from './FallingNotes'

// ── Recording 2d-context stub. jsdom has no canvas backend; we capture which
// drawing ops fire so we can assert branch logic without real pixels.
function makeCtx() {
  const calls: Record<string, number> = {}
  const bump = (k: string) => () => { calls[k] = (calls[k] ?? 0) + 1 }
  const ctx = {
    calls,
    canvas: null as unknown as HTMLCanvasElement,
    clearRect: bump('clearRect'),
    fillRect: bump('fillRect'),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    save: bump('save'),
    restore: bump('restore'),
    beginPath: bump('beginPath'),
    closePath: bump('closePath'),
    moveTo: bump('moveTo'),
    lineTo: bump('lineTo'),
    arcTo: bump('arcTo'),
    stroke: bump('stroke'),
    fill: bump('fill'),
    createLinearGradient: () => ({ addColorStop: bump('addColorStop') }),
  }
  return ctx
}

let ctx: ReturnType<typeof makeCtx>

beforeEach(() => {
  theme = 'dark'
  ctx = makeCtx()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  // jsdom returns 0 for offsetWidth/Height — pin a real size so resize() proceeds.
  vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLDivElement.prototype, 'offsetHeight', 'get').mockReturnValue(400)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  // Run exactly one draw frame synchronously, then stop the loop.
  let fired = false
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (!fired) { fired = true; cb(0) }
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function note(over: Partial<NoteRenderState['note']> = {}, state: NoteRenderState['state'] = 'pending', flashAlpha?: number): NoteRenderState {
  return {
    note: { midi: 60, time: 0.5, duration: 0.5, velocity: 0.8, hand: 'right', ...over } as NoteRenderState['note'],
    state,
    flashAlpha,
  }
}

describe('FallingNotes', () => {
  it('mounts and draws the background + hit line without crashing', () => {
    render(<FallingNotes notes={[]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.clearRect).toBeGreaterThan(0)
    expect(ctx.calls.fillRect).toBeGreaterThan(0) // background + hit-line glow
  })

  it('draws lane dividers when showLaneLines is on, skips them when off', () => {
    render(<FallingNotes notes={[]} currentTime={0} keyboardHeight={120} showLaneLines />)
    const withLines = ctx.calls.stroke ?? 0
    cleanup()
    ctx = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    render(<FallingNotes notes={[]} currentTime={0} keyboardHeight={120} showLaneLines={false} />)
    const withoutLines = ctx.calls.stroke ?? 0
    expect(withLines).toBeGreaterThan(withoutLines)
  })

  it('uses the light-theme background branch', () => {
    theme = 'light'
    render(<FallingNotes notes={[]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.fillRect).toBeGreaterThan(0) // exercised the isLight branch
  })

  it('draws an in-window note (fill called for the note body)', () => {
    render(<FallingNotes notes={[note({ time: 1 }, 'pending')]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.fill).toBeGreaterThan(0)
  })

  it('skips a fully-passed note (noteBotDelta < -0.1)', () => {
    // note ends well in the past; only background/hit-line fills happen.
    const before = render(<FallingNotes notes={[]} currentTime={5} keyboardHeight={120} />)
    const bgFills = ctx.calls.fill ?? 0
    before.unmount(); cleanup()
    ctx = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    render(<FallingNotes notes={[note({ time: 0, duration: 0.5 }, 'pending')]} currentTime={5} keyboardHeight={120} />)
    expect(ctx.calls.fill ?? 0).toBe(bgFills) // note contributed no extra fills
  })

  it('skips a note that is too far ahead (> look-ahead)', () => {
    ctx = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    render(<FallingNotes notes={[note({ time: 100 }, 'pending')]} currentTime={0} keyboardHeight={120} />)
    // background fill exists; the far note adds no save/restore (note body path).
    expect(ctx.calls.save ?? 0).toBe(0)
  })

  it('skips a note outside the picked key range', () => {
    render(<FallingNotes notes={[note({ midi: 5, time: 1 }, 'pending')]} currentTime={0} keyboardHeight={120} keyCount={88} />)
    expect(ctx.calls.save ?? 0).toBe(0) // midi 5 < range.min, no note drawn
  })

  it('draws a missed note (lower alpha branch)', () => {
    render(<FallingNotes notes={[note({ time: 0.6 }, 'missed')]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.save).toBeGreaterThan(0)
  })

  it('draws a flash overlay when flashAlpha > 0', () => {
    render(<FallingNotes notes={[note({ time: 0.6 }, 'hit', 0.5)]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.fill).toBeGreaterThan(0)
  })

  it('skips a confirmed hit whose head already crossed the hit line', () => {
    // isHit && noteTopDelta <= 0.05 → continue. time==now so delta 0.
    ctx = makeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    render(<FallingNotes notes={[note({ time: 0, duration: 1 }, 'hit')]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.save ?? 0).toBe(0)
  })

  it('handles a black-key note (black radius branch)', () => {
    render(<FallingNotes notes={[note({ midi: 61, time: 1 }, 'pending')]} currentTime={0} keyboardHeight={120} />)
    expect(ctx.calls.fill).toBeGreaterThan(0)
  })

  it('bails the draw loop gracefully when getContext returns null', () => {
    ;(HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mockReturnValue(null)
    expect(() => render(<FallingNotes notes={[]} currentTime={0} keyboardHeight={120} />)).not.toThrow()
  })

  it('calls onCanvasReady with the canvas element', () => {
    const onCanvasReady = vi.fn()
    render(<FallingNotes notes={[]} currentTime={0} keyboardHeight={120} onCanvasReady={onCanvasReady} />)
    expect(onCanvasReady).toHaveBeenCalledTimes(1)
    expect(onCanvasReady.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement)
  })
})
