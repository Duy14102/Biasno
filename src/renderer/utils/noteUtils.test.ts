import { describe, it, expect } from 'vitest'
import {
  midiToNoteName, isBlackKey, getWhiteKeyIndex, getBlackKeyLeftWhite,
  detectKeyCountFromName, PIANO_MIN, PIANO_MAX, PIANO_RANGES,
} from './noteUtils'

describe('midiToNoteName', () => {
  it('names landmark MIDI numbers', () => {
    expect(midiToNoteName(21)).toBe('A0')
    expect(midiToNoteName(60)).toBe('C4')
    expect(midiToNoteName(69)).toBe('A4')
    expect(midiToNoteName(108)).toBe('C8')
  })
})

describe('isBlackKey', () => {
  it('correctly classifies black/white keys', () => {
    expect(isBlackKey(60)).toBe(false) // C4
    expect(isBlackKey(61)).toBe(true)  // C#4
    expect(isBlackKey(63)).toBe(true)  // D#4
    expect(isBlackKey(64)).toBe(false) // E4
  })
})

describe('white-key index', () => {
  it('A0 is white index 0; C8 is index 51', () => {
    expect(getWhiteKeyIndex(PIANO_MIN)).toBe(0)
    expect(getWhiteKeyIndex(PIANO_MAX)).toBe(51)
  })

  it('returns -1 for out-of-range', () => {
    expect(getWhiteKeyIndex(PIANO_MIN - 1)).toBe(-1)
  })
})

describe('getBlackKeyLeftWhite', () => {
  it('places each black key on top of its left white neighbour', () => {
    expect(getBlackKeyLeftWhite(22)).toBe(getWhiteKeyIndex(21))
    expect(getBlackKeyLeftWhite(61)).toBe(getWhiteKeyIndex(60))
  })
})

describe('detectKeyCountFromName', () => {
  it('returns 88 by default', () => {
    expect(detectKeyCountFromName(null)).toBe(88)
    expect(detectKeyCountFromName(undefined)).toBe(88)
    expect(detectKeyCountFromName('Generic MIDI')).toBe(88)
  })

  it('extracts size tokens', () => {
    expect(detectKeyCountFromName('Casio CDP-S160 88')).toBe(88)
    expect(detectKeyCountFromName('Yamaha P-76')).toBe(76)
    expect(detectKeyCountFromName('Roland 61-key')).toBe(61)
  })
})

describe('PIANO_RANGES', () => {
  it('agrees with PIANO_MIN/MAX for the 88 range', () => {
    expect(PIANO_RANGES[88].min).toBe(PIANO_MIN)
    expect(PIANO_RANGES[88].max).toBe(PIANO_MAX)
    expect(PIANO_RANGES[88].totalWhite).toBe(52)
  })
})
