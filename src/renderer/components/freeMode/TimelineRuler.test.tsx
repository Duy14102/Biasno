import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import TimelineRuler from './TimelineRuler'

afterEach(() => cleanup())

// Major ticks carry an m:ss label; minor ticks are bare <span> marks.  The
// step table in pickStep() drives how many of each appear, so asserting tick
// counts exercises every branch of pickStep plus the major/minor split loop.
function counts(range: number) {
  const { container } = render(<TimelineRuler range={range} />)
  const majors = container.querySelectorAll('div[style*="left"]').length
  const minors = container.querySelectorAll('span[aria-hidden]').length
  return { majors, minors, container }
}

describe('TimelineRuler', () => {
  it('uses the <6s step (1s major / 0.2s minor)', () => {
    // range 5000ms: majors at 0,1000..5000 = 6; minors every 200ms minus the 6 majors
    const { majors, minors } = counts(5000)
    expect(majors).toBe(6)
    // 0..5000 step 200 => 26 ticks, 6 land on majors
    expect(minors).toBe(26 - 6)
  })

  it('uses the 6–30s step (5s major / 1s minor)', () => {
    const { majors } = counts(20000) // majors 0,5000,10000,15000,20000
    expect(majors).toBe(5)
  })

  it('uses the 30–120s step (10s major)', () => {
    const { majors } = counts(60000) // 0,10k,20k,30k,40k,50k,60k
    expect(majors).toBe(7)
  })

  it('uses the 120–600s step (30s major)', () => {
    const { majors } = counts(180000) // 0,30k,...,180k = 7
    expect(majors).toBe(7)
  })

  it('uses the >=600s step (60s major)', () => {
    const { majors } = counts(600000) // 0,60k,...,600k = 11
    expect(majors).toBe(11)
  })

  it('renders an m:ss label on a major tick', () => {
    const { getByText } = render(<TimelineRuler range={20000} />)
    expect(getByText('0:05')).toBeTruthy()
    expect(getByText('0:20')).toBeTruthy()
  })

  it('flips the last major tick with translateX(-100%) so it stays on-screen', () => {
    const { container } = render(<TimelineRuler range={20000} />)
    const majors = container.querySelectorAll('div[style*="left"]')
    const last = majors[majors.length - 1] as HTMLElement
    expect(last.style.transform).toBe('translateX(-100%)')
    const first = majors[0] as HTMLElement
    expect(first.style.transform).toBe('')
  })

  it('does not divide by zero when range is 0 (safeRange clamp)', () => {
    expect(() => render(<TimelineRuler range={0} />)).not.toThrow()
    const { container } = render(<TimelineRuler range={0} />)
    // only ms=0 fits the loop; it lands on a major
    expect(container.querySelectorAll('div[style*="left"]').length).toBe(1)
  })
})
