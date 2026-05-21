import type { RecordedNote } from './types'
import { LS } from '@/constants'
import { loadJSON, saveJSON } from '@/utils'

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

const readAll = (): LibraryEntry[] =>
  loadJSON<LibraryEntry[]>(LS.FREE_LIBRARY, [], (v): v is LibraryEntry[] => Array.isArray(v))

const writeAll = (entries: LibraryEntry[]): void => saveJSON(LS.FREE_LIBRARY, entries)

function genId(): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 6)
  return `${t}-${r}`
}

export function listEntries(): LibraryEntry[] {
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
