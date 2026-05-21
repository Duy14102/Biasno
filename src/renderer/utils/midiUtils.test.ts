import { describe, it, expect } from 'vitest'
import { filterNotesByMode } from './midiUtils'
import type { MidiNote, Hand } from '@/types'

const n = (id: string, hand: Hand, midi = 60): MidiNote => ({
  id, midi, time: 0, duration: 1, velocity: 0.8, name: '?',
  track: 0, hand, channel: 0,
})

describe('filterNotesByMode', () => {
  const notes = [
    n('r1', 'right'),
    n('r2', 'right'),
    n('l1', 'left'),
    n('u1', 'unknown'),
  ]

  it('keeps only the listed hands plus "unknown"', () => {
    expect(filterNotesByMode(notes, ['right']).map(x => x.id)).toEqual(['r1', 'r2', 'u1'])
    expect(filterNotesByMode(notes, ['left']).map(x => x.id)).toEqual(['l1', 'u1'])
  })

  it('keeps everything when both hands are active', () => {
    expect(filterNotesByMode(notes, ['left', 'right']).map(x => x.id))
      .toEqual(['r1', 'r2', 'l1', 'u1'])
  })

  it('still returns "unknown" notes when no hands are listed', () => {
    expect(filterNotesByMode(notes, []).map(x => x.id)).toEqual(['u1'])
  })

  it('returns [] for an empty input', () => {
    expect(filterNotesByMode([], ['right'])).toEqual([])
  })
})
