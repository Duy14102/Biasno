import { describe, it, expect } from 'vitest'
import { DICTIONARIES, LANGUAGES, type Lang } from './translations'

describe('DICTIONARIES', () => {
  it('registers every language listed in LANGUAGES', () => {
    for (const { code } of LANGUAGES) {
      expect(DICTIONARIES[code]).toBeDefined()
    }
  })

  it('every dictionary has the same set of keys as the vi (canonical) dictionary', () => {
    const canonical = Object.keys(DICTIONARIES.vi).sort()
    for (const code of Object.keys(DICTIONARIES) as Lang[]) {
      const keys = Object.keys(DICTIONARIES[code]).sort()
      // Find any keys missing from this language's dictionary.
      const missing = canonical.filter(k => !keys.includes(k))
      const extra   = keys.filter(k => !canonical.includes(k))
      expect({ lang: code, missing, extra })
        .toEqual({ lang: code, missing: [], extra: [] })
    }
  })

  it('every translation value is a non-empty string', () => {
    for (const code of Object.keys(DICTIONARIES) as Lang[]) {
      const dict = DICTIONARIES[code]
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${code}.${key}`).toBe('string')
        expect(value.length, `${code}.${key} should be non-empty`).toBeGreaterThan(0)
      }
    }
  })
})
