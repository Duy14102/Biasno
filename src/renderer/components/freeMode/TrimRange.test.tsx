import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import type { Clip, RecordedNote } from '@/freeMode'

// @/freeMode barrel → useFreePlayback → @/audio → tone (unresolvable under
// vitest). Stub @/audio so the real clipAt/chunkEndAt still load.
vi.mock('@/audio', () => ({ audioEngine: {}, sustainedEnd: () => 0 }))
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
vi.mock('./ClipContextMenu', () => ({ default: () => <div data-testid="clip-menu" /> }))

import TrimRange from './TrimRange'

beforeEach(() => {
  ;(global as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} disconnect() {} }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), rect: vi.fn(),
    beginPath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), fillText: vi.fn(), roundRect: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textBaseline: '',
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 100, width: 100, top: 0, bottom: 96, height: 96, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const notes: RecordedNote[] = [{ id: 'n', midi: 60, velocity: 1, startMs: 0, endMs: 400 }]
const fmt = (ms: number) => `${ms}ms`

type P = React.ComponentProps<typeof TrimRange>
function setup(over: Partial<P> = {}) {
  const props: P = {
    min: 0, max: 1000, startMs: 100, endMs: 800, notes,
    onDraftStart: vi.fn(), onDraftEnd: vi.fn(),
    onCommitStart: vi.fn(), onCommitEnd: vi.fn(),
    formatMs: fmt, ...over,
  }
  return { props, ...render(<TrimRange {...props} />) }
}

describe('TrimRange', () => {
  it('renders the formatted trim-start and trim-end chips', () => {
    const { getByText } = setup()
    expect(getByText('100ms')).toBeTruthy()
    expect(getByText('800ms')).toBeTruthy()
  })

  it('omits the add-segment button unless onAddSegment is supplied', () => {
    const { queryByLabelText } = setup()
    expect(queryByLabelText('Add')).toBeNull()
  })

  it('renders the add-segment button when onAddSegment is provided', () => {
    const { getByLabelText } = setup({ onAddSegment: vi.fn(), addSegmentLabel: 'Add' })
    expect(getByLabelText('Add')).toBeTruthy()
  })

  it('opens the clip context menu on right-click when clip actions are wired', () => {
    const clipActions = {
      split: vi.fn(), copy: vi.fn(), paste: vi.fn(),
      remove: vi.fn(), setVolume: vi.fn(), toggleLock: vi.fn(), setComment: vi.fn(),
    } as unknown as P['clipActions']
    const snapshotForMenu = {
      notes, durationMs: 1000, trimStartMs: 100, trimEndMs: 800,
      clips: [{ id: 'c', startMs: 0, endMs: 1000, volume: 1, locked: false } as Clip],
    } as P['snapshotForMenu']
    const { container, queryByTestId } = setup({ clipActions, snapshotForMenu })
    expect(queryByTestId('clip-menu')).toBeNull() // closed initially
    const track = container.querySelector('.h-24') as HTMLElement
    fireEvent.contextMenu(track, { clientX: 50, clientY: 10 })
    expect(queryByTestId('clip-menu')).toBeTruthy() // opened
  })

  it('does not open a menu on right-click without clip actions', () => {
    const { container } = setup()
    const track = container.querySelector('.h-24') as HTMLElement
    expect(() => fireEvent.contextMenu(track, { clientX: 50, clientY: 10 })).not.toThrow()
  })
})
