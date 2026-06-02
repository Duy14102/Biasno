import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTrimDrag } from './useTrimDrag'

const mouse = (type: string, clientX: number) =>
  new MouseEvent(type, { clientX, bubbles: true })

type Args = Parameters<typeof useTrimDrag>[0]

function setup(over: Partial<Args> = {}) {
  const onDraft = vi.fn()
  const onCommit = vi.fn()
  const playbackMsRef = { current: undefined as number | undefined }
  const args: Args = {
    startMs: 100, endMs: 900, durationMs: 1000, minGapMs: 50,
    msAtClientX: (x: number) => x,    // 1px = 1ms
    playbackMsRef,
    onDraft, onCommit,
    ...over,
  }
  const hook = renderHook((p: Args) => useTrimDrag(p), { initialProps: args })
  return { hook, onDraft, onCommit, playbackMsRef, args }
}

const beginEvt = () => ({ button: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() })

afterEach(() => vi.clearAllMocks())

describe('useTrimDrag — activation', () => {
  it('ignores non-left buttons', () => {
    const { hook } = setup()
    act(() => hook.result.current.begin('start')({ button: 2, preventDefault: vi.fn(), stopPropagation: vi.fn() } as never))
    expect(hook.result.current.active).toBe(null)
  })

  it('begin sets the active side', () => {
    const { hook } = setup()
    act(() => hook.result.current.begin('end')(beginEvt() as never))
    expect(hook.result.current.active).toBe('end')
  })
})

describe('useTrimDrag — drafting + clamp', () => {
  it('start handle clamps to [0, endMs - minGap]', () => {
    const { hook, onDraft } = setup()
    act(() => hook.result.current.begin('start')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mousemove', -50)) })    // below 0
    expect(onDraft).toHaveBeenLastCalledWith('start', 0)
    act(() => { window.dispatchEvent(mouse('mousemove', 5000)) })   // past end-gap
    expect(onDraft).toHaveBeenLastCalledWith('start', 850)          // 900 - 50
  })

  it('end handle clamps to [startMs + minGap, durationMs]', () => {
    const { hook, onDraft } = setup()
    act(() => hook.result.current.begin('end')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mousemove', 5000)) })   // past duration
    expect(onDraft).toHaveBeenLastCalledWith('end', 1000)
    act(() => { window.dispatchEvent(mouse('mousemove', 0)) })      // below start+gap
    expect(onDraft).toHaveBeenLastCalledWith('end', 150)            // 100 + 50
  })

  it('move with no active side is a no-op (listener removed after up)', () => {
    const { hook, onDraft } = setup()
    act(() => hook.result.current.begin('start')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mouseup', 300)) })
    onDraft.mockClear()
    act(() => { window.dispatchEvent(mouse('mousemove', 400)) })
    expect(onDraft).not.toHaveBeenCalled()
  })
})

describe('useTrimDrag — snap to playhead', () => {
  it('snaps onto the playhead when within SNAP_MS and flags snappedSide', () => {
    const { hook, onDraft } = setup({ playbackMsRef: { current: 500 } })
    act(() => hook.result.current.begin('start')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mousemove', 450)) })    // |450-500|=50 < 120
    expect(onDraft).toHaveBeenLastCalledWith('start', 500)          // snapped, then clamped (no-op)
    expect(hook.result.current.snappedSide).toBe('start')
  })

  it('does not snap when outside SNAP_MS', () => {
    const { hook, onDraft } = setup({ playbackMsRef: { current: 500 } })
    act(() => hook.result.current.begin('start')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mousemove', 300)) })    // |300-500|=200 > 120
    expect(onDraft).toHaveBeenLastCalledWith('start', 300)
    expect(hook.result.current.snappedSide).toBe(null)
  })

  it('no snap when playhead is undefined', () => {
    const { hook, onDraft } = setup({ playbackMsRef: { current: undefined } })
    act(() => hook.result.current.begin('end')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mousemove', 600)) })
    expect(onDraft).toHaveBeenLastCalledWith('end', 600)
    expect(hook.result.current.snappedSide).toBe(null)
  })
})

describe('useTrimDrag — commit on mouseup', () => {
  it('commits the clamped value and resets active + snapped state', () => {
    const { hook, onCommit } = setup()
    act(() => hook.result.current.begin('end')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mouseup', 700)) })
    expect(onCommit).toHaveBeenCalledWith('end', 700)
    expect(hook.result.current.active).toBe(null)
    expect(hook.result.current.snappedSide).toBe(null)
  })

  it('commit also applies snap', () => {
    const { hook, onCommit } = setup({ playbackMsRef: { current: 700 } })
    act(() => hook.result.current.begin('end')(beginEvt() as never))
    act(() => { window.dispatchEvent(mouse('mouseup', 660)) })      // |660-700|<120
    expect(onCommit).toHaveBeenCalledWith('end', 700)
  })
})
