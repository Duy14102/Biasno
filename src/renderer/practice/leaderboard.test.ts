import { describe, it, expect, beforeEach } from 'vitest'
import {
  getScores, getBestScore, getBestScoreForMode, addScore, clearScores,
  type ScoreEntry,
} from './leaderboard'

const entry = (overrides: Partial<ScoreEntry> = {}): ScoreEntry => ({
  score: 100, success: 10, missed: 2, combosHits: 3, maxCombo: 5,
  totalNotes: 12, accuracy: 0.83, mode: 'right-melody', date: Date.now(),
  ...overrides,
})

describe('leaderboard', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns [] for a song with no scores', () => {
    expect(getScores('song.mid')).toEqual([])
    expect(getBestScore('song.mid')).toBeNull()
  })

  it('addScore stores a new entry', () => {
    addScore('song.mid', entry({ score: 50 }))
    const all = getScores('song.mid')
    expect(all).toHaveLength(1)
    expect(all[0].score).toBe(50)
  })

  it('sorts descending by score, then by accuracy', () => {
    addScore('s.mid', entry({ score: 30, accuracy: 0.9 }))
    addScore('s.mid', entry({ score: 50, accuracy: 0.5 }))
    addScore('s.mid', entry({ score: 50, accuracy: 0.9 }))
    const all = getScores('s.mid')
    expect(all.map(s => s.score)).toEqual([50, 50, 30])
    expect(all[0].accuracy).toBe(0.9)
    expect(all[1].accuracy).toBe(0.5)
  })

  it('getBestScore returns the top entry', () => {
    addScore('s.mid', entry({ score: 30 }))
    addScore('s.mid', entry({ score: 70 }))
    expect(getBestScore('s.mid')?.score).toBe(70)
  })

  it('getBestScoreForMode filters by mode', () => {
    addScore('s.mid', entry({ score: 100, mode: 'right-melody' }))
    addScore('s.mid', entry({ score: 80,  mode: 'left-rhythm' }))
    expect(getBestScoreForMode('s.mid', 'right-melody')?.score).toBe(100)
    expect(getBestScoreForMode('s.mid', 'left-rhythm')?.score).toBe(80)
    expect(getBestScoreForMode('s.mid', 'both-melody-rhythm')).toBeNull()
  })

  it('caps stored entries at 50 per song', () => {
    for (let i = 0; i < 60; i++) addScore('s.mid', entry({ score: i }))
    const all = getScores('s.mid')
    expect(all).toHaveLength(50)
    // Lowest 10 should have been dropped.
    expect(all[all.length - 1].score).toBe(10)
  })

  it('clearScores wipes one song without touching others', () => {
    addScore('a.mid', entry({ score: 10 }))
    addScore('b.mid', entry({ score: 20 }))
    clearScores('a.mid')
    expect(getScores('a.mid')).toEqual([])
    expect(getScores('b.mid')).toHaveLength(1)
  })

  it('survives malformed localStorage (returns empty list)', () => {
    localStorage.setItem('biasno.leaderboards', '{not json')
    expect(getScores('s.mid')).toEqual([])
  })

  it('survives non-object localStorage payload', () => {
    localStorage.setItem('biasno.leaderboards', '[1,2,3]')
    expect(getScores('s.mid')).toEqual([])
  })
})
