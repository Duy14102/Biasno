import { describe, it, expect, beforeEach } from 'vitest'
import { loadJSON, saveJSON, removeKey, isPlainObject } from './storage'

describe('loadJSON / saveJSON', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns fallback on missing key', () => {
    expect(loadJSON('absent', { a: 1 })).toEqual({ a: 1 })
  })

  it('roundtrips a value', () => {
    saveJSON('k', { x: 7, y: [1, 2] })
    expect(loadJSON('k', null)).toEqual({ x: 7, y: [1, 2] })
  })

  it('returns fallback on invalid JSON', () => {
    localStorage.setItem('k', '{not json')
    expect(loadJSON('k', 'default')).toBe('default')
  })

  it('uses isValid predicate to reject malformed payloads', () => {
    saveJSON('k', 'string-not-array')
    expect(loadJSON<number[]>('k', [], Array.isArray)).toEqual([])
  })

  it('removeKey deletes the entry', () => {
    saveJSON('k', 1)
    removeKey('k')
    expect(localStorage.getItem('k')).toBeNull()
  })
})

describe('isPlainObject', () => {
  it('accepts plain objects', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })

  it('rejects arrays, null, primitives', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(1)).toBe(false)
    expect(isPlainObject('x')).toBe(false)
  })
})
