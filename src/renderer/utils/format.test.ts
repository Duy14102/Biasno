import { describe, it, expect } from 'vitest'
import { formatTimeSec, formatTimeMs, formatShortDate } from './format'

describe('formatTimeSec', () => {
  it('formats sub-minute durations', () => {
    expect(formatTimeSec(0)).toBe('0:00')
    expect(formatTimeSec(5)).toBe('0:05')
    expect(formatTimeSec(59)).toBe('0:59')
  })

  it('formats multi-minute durations', () => {
    expect(formatTimeSec(60)).toBe('1:00')
    expect(formatTimeSec(125.7)).toBe('2:05')
    expect(formatTimeSec(3599)).toBe('59:59')
  })

  it('clamps negative values', () => {
    expect(formatTimeSec(-10)).toBe('0:00')
  })
})

describe('formatTimeMs', () => {
  it('formats milliseconds as m:ss by default', () => {
    expect(formatTimeMs(0)).toBe('0:00')
    expect(formatTimeMs(5000)).toBe('0:05')
    expect(formatTimeMs(65000)).toBe('1:05')
  })

  it('supports decimal precision', () => {
    expect(formatTimeMs(1500, { decimals: 1 })).toBe('0:01.5')
    expect(formatTimeMs(65500, { decimals: 1 })).toBe('1:05.5')
  })

  it('clamps negative values', () => {
    expect(formatTimeMs(-10)).toBe('0:00')
  })
})

describe('formatShortDate', () => {
  it('returns a non-empty string for a valid timestamp', () => {
    const out = formatShortDate(Date.UTC(2025, 0, 15))
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toBe('—')
  })
})
