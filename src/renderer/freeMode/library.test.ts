import { describe, it, expect, beforeEach } from 'vitest'
import {
  listEntries, getEntry, createEntry, updateEntry, deleteEntry,
  type LibraryEntry,
} from './library'

const base = (overrides: Partial<Omit<LibraryEntry, 'id' | 'createdAt' | 'updatedAt'>> = {}) => ({
  name:        'Untitled',
  author:      '',
  notes:       [],
  durationMs:  10000,
  trimStartMs: 0,
  trimEndMs:   10000,
  ...overrides,
})

describe('freeMode/library', () => {
  beforeEach(() => { localStorage.clear() })

  it('starts empty', () => {
    expect(listEntries()).toEqual([])
  })

  it('createEntry returns an entry with id + timestamps', () => {
    const e = createEntry(base({ name: 'Test' }))
    expect(e.id).toMatch(/.+-.+/)
    expect(e.createdAt).toBeGreaterThan(0)
    expect(e.updatedAt).toBe(e.createdAt)
    expect(e.name).toBe('Test')
  })

  it('getEntry returns a stored entry by id', () => {
    const e = createEntry(base({ name: 'A' }))
    expect(getEntry(e.id)?.name).toBe('A')
    expect(getEntry('nope')).toBeNull()
  })

  it('listEntries sorts newest-first by updatedAt', async () => {
    const a = createEntry(base({ name: 'A' }))
    await new Promise(r => setTimeout(r, 5))
    const b = createEntry(base({ name: 'B' }))
    const list = listEntries()
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('updateEntry mutates fields and bumps updatedAt', async () => {
    const e = createEntry(base({ name: 'Old' }))
    const originalUpdated = e.updatedAt
    await new Promise(r => setTimeout(r, 5))
    updateEntry(e.id, { name: 'New' })
    const after = getEntry(e.id)!
    expect(after.name).toBe('New')
    expect(after.updatedAt).toBeGreaterThan(originalUpdated)
  })

  it('updateEntry is a no-op for unknown ids', () => {
    updateEntry('nope', { name: 'X' })
    expect(listEntries()).toEqual([])
  })

  it('deleteEntry removes only the targeted row', () => {
    const a = createEntry(base({ name: 'A' }))
    const b = createEntry(base({ name: 'B' }))
    deleteEntry(a.id)
    expect(listEntries()).toHaveLength(1)
    expect(getEntry(a.id)).toBeNull()
    expect(getEntry(b.id)).not.toBeNull()
  })

  it('caps storage at 50 entries (oldest by updatedAt evicted)', () => {
    for (let i = 0; i < 60; i++) createEntry(base({ name: `n${i}` }))
    expect(listEntries()).toHaveLength(50)
  })

  it('survives malformed localStorage payload', () => {
    localStorage.setItem('freeMode:library:v1', '{not json')
    expect(listEntries()).toEqual([])
  })
})
