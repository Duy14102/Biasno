// Persistent library of past Free Mode recordings.
//
// Stored in localStorage under a single key — small enough that JSON round-trip
// is fine (cap at 50 entries; new ones evict the oldest).  Clearing the live
// recorder draft no longer destroys anything — every Stop pushes a fresh
// entry here automatically, and Load/Delete go through this module.

import type { RecordedNote } from './types'

const KEY = 'freeMode:library:v1'
const MAX_ENTRIES = 50

export interface LibraryEntry {
  id:          string
  name:        string
  author:      string
  notes:       RecordedNote[]
  durationMs:  number
  trimStartMs: number
  trimEndMs:   number
  createdAt:   number
  updatedAt:   number
}

function readAll(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as LibraryEntry[]
  } catch {
    return []
  }
}

function writeAll(entries: LibraryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch { /* quota — silent */ }
}

function genId(): string {
  // ms timestamp + 4-char random tail.  Unique enough for a per-user library;
  // ordered by creation when sorted lexicographically.
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 6)
  return `${t}-${r}`
}

export function listEntries(): LibraryEntry[] {
  // Newest first.
  return readAll().slice().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getEntry(id: string): LibraryEntry | null {
  return readAll().find(e => e.id === id) ?? null
}

export function createEntry(
  partial: Omit<LibraryEntry, 'id' | 'createdAt' | 'updatedAt'>,
): LibraryEntry {
  const all = readAll()
  const now = Date.now()
  const entry: LibraryEntry = { ...partial, id: genId(), createdAt: now, updatedAt: now }
  const next = [entry, ...all]
  // Evict oldest if over cap.  Sort by updatedAt asc and drop tail.
  if (next.length > MAX_ENTRIES) {
    next.sort((a, b) => b.updatedAt - a.updatedAt)
    next.length = MAX_ENTRIES
  }
  writeAll(next)
  return entry
}

export function updateEntry(id: string, patch: Partial<Omit<LibraryEntry, 'id' | 'createdAt'>>): void {
  const all = readAll()
  const idx = all.findIndex(e => e.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() }
  writeAll(all)
}

export function deleteEntry(id: string): void {
  writeAll(readAll().filter(e => e.id !== id))
}
