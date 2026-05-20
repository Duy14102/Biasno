// ─── Leaderboard storage ─────────────────────────────────────────────────────
// One leaderboard per song, keyed by midi file name.  Stored in localStorage
// as a JSON blob.  Scores from view-listen (demo) mode are never saved — only
// real practice modes that exercise the player count.

import type { PracticeMode } from '../types'

export const LS_LEADERBOARDS = 'biasno.leaderboards'

export interface ScoreEntry {
  score:      number
  success:    number   // notes hit correctly
  missed:     number   // notes that scrolled past without being hit
  combosHits: number   // hits that earned the combo bonus (+2)
  maxCombo:   number   // longest consecutive streak
  totalNotes: number
  accuracy:   number   // success / totalNotes (0..1)
  mode:       PracticeMode
  date:       number   // Date.now()
  /** Set on entries saved during loop practice — `null`/`undefined` means a
   *  full song play.  Times are in seconds (song time). */
  loopRegion?: { startSec: number; endSec: number } | null
}

type LeaderboardMap = Partial<Record<string /* midi name */, ScoreEntry[]>>

function loadAll(): LeaderboardMap {
  try {
    const raw = localStorage.getItem(LS_LEADERBOARDS)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch { return {} }
}

function saveAll(map: LeaderboardMap): void {
  try { localStorage.setItem(LS_LEADERBOARDS, JSON.stringify(map)) } catch { /* quota */ }
}

/** All scores for a song, sorted desc by score then accuracy. */
export function getScores(midiName: string): ScoreEntry[] {
  const map = loadAll()
  const list = map[midiName] ?? []
  return [...list].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.accuracy - a.accuracy
  )
}

/** Best score (highest) for a song, or null if none yet. */
export function getBestScore(midiName: string): ScoreEntry | null {
  const sorted = getScores(midiName)
  return sorted[0] ?? null
}

/** Best score for a (song, mode) pair.  Used for the "new best" badge so
 *  the comparison matches what the leaderboard's mode-filter shows — a
 *  Melody·Right run is graded against past Melody·Right runs, not against
 *  an unrelated Rhythm score that happens to be higher. */
export function getBestScoreForMode(midiName: string, mode: PracticeMode): ScoreEntry | null {
  return getScores(midiName).find((s) => s.mode === mode) ?? null
}

/** Append a new score.  Keeps the top 50 entries per song so storage stays bounded. */
export function addScore(midiName: string, entry: ScoreEntry): void {
  const map = loadAll()
  const list = map[midiName] ?? []
  list.push(entry)
  list.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.accuracy - a.accuracy
  )
  map[midiName] = list.slice(0, 50)
  saveAll(map)
}

/** Clear all scores for a song. */
export function clearScores(midiName: string): void {
  const map = loadAll()
  delete map[midiName]
  saveAll(map)
}
