import type { PracticeMode } from '../types'
import { LS } from '../constants/storageKeys'
import { loadJSON, saveJSON, isPlainObject } from '../utils/storage'

export interface ScoreEntry {
  score:      number
  success:    number
  missed:     number
  combosHits: number
  maxCombo:   number
  totalNotes: number
  accuracy:   number
  mode:       PracticeMode
  date:       number
  loopRegion?: { startSec: number; endSec: number } | null
}

type LeaderboardMap = Partial<Record<string, ScoreEntry[]>>

const sortByScore = (a: ScoreEntry, b: ScoreEntry): number =>
  b.score !== a.score ? b.score - a.score : b.accuracy - a.accuracy

const loadAll = (): LeaderboardMap =>
  loadJSON<LeaderboardMap>(LS.LEADERBOARDS, {}, isPlainObject)

const saveAll = (map: LeaderboardMap): void => saveJSON(LS.LEADERBOARDS, map)

export function getScores(midiName: string): ScoreEntry[] {
  const list = loadAll()[midiName] ?? []
  return [...list].sort(sortByScore)
}

export function getBestScore(midiName: string): ScoreEntry | null {
  return getScores(midiName)[0] ?? null
}

export function getBestScoreForMode(midiName: string, mode: PracticeMode): ScoreEntry | null {
  return getScores(midiName).find((s) => s.mode === mode) ?? null
}

export function addScore(midiName: string, entry: ScoreEntry): void {
  const map = loadAll()
  const list = map[midiName] ?? []
  list.push(entry)
  list.sort(sortByScore)
  map[midiName] = list.slice(0, 50)
  saveAll(map)
}

export function clearScores(midiName: string): void {
  const map = loadAll()
  delete map[midiName]
  saveAll(map)
}
