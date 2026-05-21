import { describe, it, expect } from 'vitest'
import {
  parseMode, handLabelKey, skillLabelKey, modeLabel,
  getActiveHands, requiresMelody, requiresRhythm,
} from './mode'

describe('parseMode', () => {
  it('returns nulls for view-listen', () => {
    expect(parseMode('view-listen')).toEqual({ hand: null, skill: null })
  })

  it('splits simple modes', () => {
    expect(parseMode('right-melody')).toEqual({ hand: 'right', skill: 'melody' })
    expect(parseMode('left-rhythm')).toEqual({ hand: 'left', skill: 'rhythm' })
    expect(parseMode('both-melody-rhythm')).toEqual({ hand: 'both', skill: 'melody-rhythm' })
  })
})

describe('label keys', () => {
  it('maps hand → translation key', () => {
    expect(handLabelKey('left')).toBe('leftHand')
    expect(handLabelKey('right')).toBe('rightHand')
    expect(handLabelKey('both')).toBe('bothHands')
  })

  it('maps skill → translation key', () => {
    expect(skillLabelKey('melody')).toBe('melody')
    expect(skillLabelKey('rhythm')).toBe('rhythm')
    expect(skillLabelKey('melody-rhythm')).toBe('melodyRhythm')
  })
})

describe('modeLabel', () => {
  const fakeT = (k: string): string => k

  it('returns viewListenShort for view-listen', () => {
    expect(modeLabel('view-listen', fakeT)).toBe('viewListenShort')
  })

  it('joins hand + skill with custom separator', () => {
    expect(modeLabel('right-melody', fakeT)).toBe('rightHand · melody')
    expect(modeLabel('left-rhythm', fakeT, ' — ')).toBe('leftHand — rhythm')
  })
})

describe('getActiveHands', () => {
  it('returns the appropriate hand list per mode', () => {
    expect(getActiveHands('right-melody')).toEqual(['right'])
    expect(getActiveHands('left-rhythm')).toEqual(['left'])
    expect(getActiveHands('both-melody-rhythm')).toEqual(['left', 'right'])
    expect(getActiveHands('view-listen')).toEqual(['left', 'right'])
  })
})

describe('requiresMelody / requiresRhythm', () => {
  it('detects melody-bearing modes', () => {
    expect(requiresMelody('right-melody')).toBe(true)
    expect(requiresMelody('view-listen')).toBe(true)
    expect(requiresMelody('right-rhythm')).toBe(false)
  })

  it('detects rhythm-bearing modes', () => {
    expect(requiresRhythm('right-rhythm')).toBe(true)
    expect(requiresRhythm('view-listen')).toBe(true)
    expect(requiresRhythm('right-melody')).toBe(false)
  })
})
