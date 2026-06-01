import { describe, it, expect } from 'vitest'
import { pedalDownAt, sustainedEnd } from './pedal'
import type { PedalEvent } from '@/types'

const ev = (time: number, down: boolean): PedalEvent => ({ time, down })

describe('pedalDownAt', () => {
  it('is up before the first event', () => {
    expect(pedalDownAt(0.5, [ev(1, true)])).toBe(false)
  })
  it('is down between a down edge and the next up edge', () => {
    const t = [ev(1, true), ev(3, false)]
    expect(pedalDownAt(2, t)).toBe(true)
    expect(pedalDownAt(3, t)).toBe(false) // up edge takes effect at its own time
    expect(pedalDownAt(4, t)).toBe(false)
  })
})

describe('sustainedEnd', () => {
  const songEnd = 10

  it('returns noteEnd when there is no pedal timeline', () => {
    expect(sustainedEnd(2, undefined, songEnd)).toBe(2)
    expect(sustainedEnd(2, [], songEnd)).toBe(2)
  })

  it('returns noteEnd when the pedal is up at release', () => {
    const t = [ev(5, true), ev(6, false)]
    expect(sustainedEnd(2, t, songEnd)).toBe(2)
  })

  it('rings to the next pedal-up when held at release', () => {
    const t = [ev(1, true), ev(4, false)]
    expect(sustainedEnd(2, t, songEnd)).toBe(4)
  })

  it('rings to songEnd when the pedal never lifts again', () => {
    const t = [ev(1, true)]
    expect(sustainedEnd(2, t, songEnd)).toBe(songEnd)
  })

  it('never shortens a note', () => {
    const t = [ev(1, true), ev(1.5, false)]
    // note released at 2, pedal already up by 1.5 → stays 2
    expect(sustainedEnd(2, t, songEnd)).toBe(2)
  })
})
