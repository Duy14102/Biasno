import { describe, it, expect } from 'vitest'
import { handColorKey, handColorOf, HAND_COLORS } from './handColors'

describe('handColorKey', () => {
  it('maps right hand to white/black slots', () => {
    expect(handColorKey(60, 'right', false)).toBe('right-white')
    expect(handColorKey(61, 'right', true)).toBe('right-black')
  })

  it('maps left hand to white/black slots', () => {
    expect(handColorKey(60, 'left', false)).toBe('left-white')
    expect(handColorKey(61, 'left', true)).toBe('left-black')
  })

  it('maps unknown hand regardless of isBlack', () => {
    expect(handColorKey(60, 'unknown', false)).toBe('unknown')
    expect(handColorKey(61, 'unknown', true)).toBe('unknown')
  })
})

describe('handColorOf', () => {
  it('returns the swatch for the resolved key', () => {
    expect(handColorOf(60, 'right', false)).toBe(HAND_COLORS['right-white'])
    expect(handColorOf(61, 'right', true)).toBe(HAND_COLORS['right-black'])
    expect(handColorOf(60, 'left', false)).toBe(HAND_COLORS['left-white'])
    expect(handColorOf(61, 'left', true)).toBe(HAND_COLORS['left-black'])
    expect(handColorOf(60, 'unknown', false)).toBe(HAND_COLORS['unknown'])
  })

  it('every swatch has fill/glow/stroke hex values', () => {
    for (const key of Object.keys(HAND_COLORS) as (keyof typeof HAND_COLORS)[]) {
      const c = HAND_COLORS[key]
      expect(c.fill).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.glow).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.stroke).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})
