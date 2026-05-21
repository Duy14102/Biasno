import { describe, it, expect } from 'vitest'
import { findBestResumeTime } from './noteState'
import type { MidiNote } from '@/types'

const at = (id: string, time: number): MidiNote => ({
  id, midi: 60, time, duration: 0.5, velocity: 0.8, name: 'C4',
  track: 0, hand: 'right', channel: 0,
})

describe('findBestResumeTime', () => {
  it('returns 0 for an empty note list', () => {
    expect(findBestResumeTime([], 5)).toBe(0)
  })

  it('returns 0 when target is before the first note', () => {
    expect(findBestResumeTime([at('a', 10)], 5)).toBe(0)
  })

  it('snaps to the nearest preceding onset', () => {
    const notes = [at('a', 1), at('b', 3), at('c', 5), at('d', 7)]
    expect(findBestResumeTime(notes, 4.9)).toBe(3)
    expect(findBestResumeTime(notes, 5)).toBe(5)
    expect(findBestResumeTime(notes, 5.1)).toBe(5)
  })

  it('returns the latest match even when notes are unordered', () => {
    const notes = [at('c', 5), at('a', 1), at('d', 7), at('b', 3)]
    expect(findBestResumeTime(notes, 6)).toBe(5)
  })

  it('returns the last note when target is past the end', () => {
    const notes = [at('a', 1), at('b', 3)]
    expect(findBestResumeTime(notes, 100)).toBe(3)
  })
})
