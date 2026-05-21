import { describe, it, expect } from 'vitest'
import { bsearchStep, lowerBoundRefs, type NoteRef } from './noteRefs'

const ref = (timeInSeconds: number): NoteRef => ({
  timeInSeconds, durSeconds: 0.5, svgId: `s${timeInSeconds}`,
  isRight: true, isBlack: false, midi: 60,
})

describe('bsearchStep', () => {
  it('returns 0 for an empty array', () => {
    expect(bsearchStep([], 5)).toBe(0)
  })

  it('finds the greatest index i with steps[i] ≤ t', () => {
    const steps = [0, 1, 2, 3, 4, 5]
    expect(bsearchStep(steps, -1)).toBe(0)
    expect(bsearchStep(steps, 0)).toBe(0)
    expect(bsearchStep(steps, 2.5)).toBe(2)
    expect(bsearchStep(steps, 5)).toBe(5)
    expect(bsearchStep(steps, 999)).toBe(5)
  })

  it('handles a singleton array', () => {
    expect(bsearchStep([7], 0)).toBe(0)
    expect(bsearchStep([7], 99)).toBe(0)
  })
})

describe('lowerBoundRefs', () => {
  it('returns 0 for an empty array', () => {
    expect(lowerBoundRefs([], 5)).toBe(0)
  })

  it('returns the first index i with refs[i].time ≥ target', () => {
    const refs = [ref(0), ref(1), ref(2.5), ref(3), ref(5)]
    expect(lowerBoundRefs(refs, -1)).toBe(0)
    expect(lowerBoundRefs(refs, 0)).toBe(0)
    expect(lowerBoundRefs(refs, 1)).toBe(1)
    expect(lowerBoundRefs(refs, 2)).toBe(2)
    expect(lowerBoundRefs(refs, 2.5)).toBe(2)
    expect(lowerBoundRefs(refs, 4)).toBe(4)
    expect(lowerBoundRefs(refs, 100)).toBe(refs.length)
  })
})
