import { describe, it, expect } from 'vitest'
import { modeGroup, modeFullLabel, MODE_GROUPS, GROUP_COLORS } from './modeGroups'

describe('modeGroup', () => {
  it('classifies view-listen', () => {
    expect(modeGroup('view-listen')).toBe('view')
  })

  it('classifies right-hand modes', () => {
    expect(modeGroup('right-melody')).toBe('right')
    expect(modeGroup('right-rhythm')).toBe('right')
    expect(modeGroup('right-melody-rhythm')).toBe('right')
  })

  it('classifies left-hand modes', () => {
    expect(modeGroup('left-melody')).toBe('left')
    expect(modeGroup('left-melody-rhythm')).toBe('left')
  })

  it('falls back to "both" for both-* modes', () => {
    expect(modeGroup('both-melody')).toBe('both')
    expect(modeGroup('both-melody-rhythm')).toBe('both')
  })
})

describe('modeFullLabel', () => {
  const fakeT = (k: string): string => k

  it('returns just the sub-key for view-listen (no parent label)', () => {
    expect(modeFullLabel('view-listen', fakeT)).toBe('viewListenShort')
  })

  it('joins parent + sub keys with a middle dot', () => {
    expect(modeFullLabel('right-melody', fakeT)).toBe('rightHand · melody')
    expect(modeFullLabel('left-rhythm', fakeT)).toBe('leftHand · rhythm')
    expect(modeFullLabel('both-melody-rhythm', fakeT)).toBe('twoHands · melodyRhythm')
  })
})

describe('MODE_GROUPS / GROUP_COLORS coverage', () => {
  it('every MODE_GROUP key has a matching GROUP_COLORS entry', () => {
    for (const g of MODE_GROUPS) {
      expect(GROUP_COLORS[g.key]).toBeDefined()
      expect(GROUP_COLORS[g.key]).toHaveProperty('badge')
      expect(GROUP_COLORS[g.key]).toHaveProperty('header')
      expect(GROUP_COLORS[g.key]).toHaveProperty('item')
      expect(GROUP_COLORS[g.key]).toHaveProperty('dot')
    }
  })
})
