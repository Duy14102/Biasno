import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import ProgressBar from './ProgressBar'

// jsdom doesn't lay out elements, so getBoundingClientRect returns zeroes.
// Pin a deterministic 0..100px track so fraction math is predictable.
function pinTrackRect() {
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 100, width: 100, top: 0, bottom: 24, height: 24, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

function setup(props: Partial<React.ComponentProps<typeof ProgressBar>> = {}) {
  const onSeek = vi.fn()
  const onLoopChange = vi.fn()
  const utils = render(
    <ProgressBar
      duration={100}
      currentTime={0}
      loopRegion={null}
      onSeek={onSeek}
      onLoopChange={onLoopChange}
      {...props}
    />,
  )
  // The track is the div carrying the mousedown handler (the flex-1 element).
  const track = utils.container.querySelector('.group') as HTMLElement
  return { onSeek, onLoopChange, track, ...utils }
}

beforeEach(pinTrackRect)
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ProgressBar', () => {
  it('seeks to the clicked fraction of the duration', () => {
    const { onSeek, track } = setup()
    fireEvent.mouseDown(track, { clientX: 50 })
    expect(onSeek).toHaveBeenCalledWith(50) // 0.5 * 100
  })

  it('shift+click clears an existing loop region', () => {
    const { onLoopChange, track } = setup({ loopRegion: { start: 0.2, end: 0.8 } })
    fireEvent.mouseDown(track, { clientX: 50, shiftKey: true })
    expect(onLoopChange).toHaveBeenCalledWith(null)
  })

  it('grabbing a loop-start handle starts a loop-start drag, not a seek', () => {
    const { onSeek, track } = setup({ loopRegion: { start: 0.2, end: 0.8 } })
    // clientX=20 == frac 0.2 == loop.start, within the 12px hit zone
    fireEvent.mouseDown(track, { clientX: 20 })
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('dragging in loop-end mode extends the end and respects the min-gap clamp', () => {
    const { onLoopChange, track } = setup({ loopRegion: { start: 0.2, end: 0.8 } })
    fireEvent.mouseDown(track, { clientX: 80 }) // grab end handle
    fireEvent.mouseMove(window, { clientX: 10 }) // drag below start
    // end clamped to start + 0.01
    expect(onLoopChange).toHaveBeenLastCalledWith({ start: 0.2, end: expect.closeTo(0.21, 5) })
  })

  it('renders elapsed and total time labels', () => {
    const { getByText } = setup({ currentTime: 30, duration: 90 })
    expect(getByText('0:30')).toBeTruthy()
    expect(getByText('1:30')).toBeTruthy()
  })

  it('toggles the total label to show remaining time on click', () => {
    const { getByTitle, getByText } = setup({ currentTime: 30, duration: 90 })
    fireEvent.click(getByTitle('Show remaining time'))
    expect(getByText('-1:00')).toBeTruthy()
  })

  it('clamps progress at duration<=0 without dividing by zero', () => {
    expect(() => setup({ duration: 0, currentTime: 5 })).not.toThrow()
  })
})
