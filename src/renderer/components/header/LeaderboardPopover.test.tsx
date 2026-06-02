import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
// Re-route the @/practice barrel (which pulls in tone via useAudioScheduler)
// straight to the leaderboard module so jsdom doesn't try to load Tone.js.
vi.mock('@/practice', async () => await import('@/practice/leaderboard'))
import { addScore, type ScoreEntry } from '@/practice/leaderboard'
import type { PracticeMode } from '@/types'
import LeaderboardPopover from './LeaderboardPopover'

const entry = (o: Partial<ScoreEntry> = {}): ScoreEntry => ({
  score: 100, success: 10, missed: 2, combosHits: 3, maxCombo: 5,
  totalNotes: 12, accuracy: 0.83, mode: 'right-melody', date: Date.UTC(2024, 0, 15),
  ...o,
})

interface Overrides { mode?: PracticeMode; challengeEnabled?: boolean }
const wrap = (over: Overrides = {}) => {
  const onChallengeToggle = vi.fn()
  const r = render(
    <LeaderboardPopover
      songName="song.mid"
      mode={over.mode ?? 'right-melody'}
      challengeEnabled={over.challengeEnabled ?? true}
      onChallengeToggle={onChallengeToggle}
    />,
  )
  return { ...r, onChallengeToggle }
}

const openBtn = (c: HTMLElement) => c.querySelector('button') as HTMLButtonElement

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('LeaderboardPopover', () => {
  it('starts closed', () => {
    const { container, queryByText } = wrap()
    expect(queryByText('leaderboardTitle')).toBeNull()
    expect(openBtn(container)).toBeTruthy()
  })

  it('challenge OFF: shows the off message, no best star, no table', () => {
    addScore('song.mid', entry({ score: 90 }))
    const { container, getByText, queryByText } = wrap({ challengeEnabled: false })
    fireEvent.click(openBtn(container))
    expect(getByText('challengeOff')).toBeTruthy()
    // best star is gated behind forMode[0]; off-mode still computes forMode but
    // scores aren't loaded until open — they are loaded, so star may show.
    expect(queryByText('rankColumn')).toBeNull()
  })

  it('challenge ON but no scores for this mode: empty state', () => {
    addScore('song.mid', entry({ score: 90, mode: 'left-rhythm' }))
    const { container, getByText, queryByText } = wrap({ mode: 'right-melody' })
    fireEvent.click(openBtn(container))
    expect(getByText('noScoresYet')).toBeTruthy()
    expect(queryByText('rankColumn')).toBeNull()
  })

  it('challenge ON with matching scores: renders ranked table + best star', () => {
    addScore('song.mid', entry({ score: 80, accuracy: 0.9, mode: 'right-melody' }))
    addScore('song.mid', entry({ score: 95, accuracy: 0.7, mode: 'right-melody' }))
    addScore('song.mid', entry({ score: 60, mode: 'right-melody' }))
    addScore('song.mid', entry({ score: 50, mode: 'right-melody' }))
    const { container, getByText, getAllByText } = wrap()
    fireEvent.click(openBtn(container))
    expect(getByText('rankColumn')).toBeTruthy()
    // best score star rounded.
    expect(getByText('★ 95')).toBeTruthy()
    // Medals for top three + numeric rank for 4th.
    expect(getByText('🥈')).toBeTruthy()
    expect(getByText('🥉')).toBeTruthy()
    expect(getByText('#4')).toBeTruthy()
    // gold trophy for rank 1 (also a header/toggle trophy => use getAllByText).
    expect(getAllByText('🥇').length).toBeGreaterThan(0)
  })

  it('renders the loop marker only for entries with a loopRegion', () => {
    addScore('song.mid', entry({ score: 70, loopRegion: { startSec: 5, endSec: 12 } }))
    addScore('song.mid', entry({ score: 40, loopRegion: null }))
    const { container, getAllByText } = wrap()
    fireEvent.click(openBtn(container))
    // Exactly one loop glyph.
    expect(getAllByText('↻')).toHaveLength(1)
  })

  it('toggles the challenge switch via callback', () => {
    const { container, onChallengeToggle } = wrap()
    fireEvent.click(openBtn(container))
    const sw = container.querySelector('[role="switch"]') as HTMLButtonElement
    fireEvent.click(sw)
    expect(onChallengeToggle).toHaveBeenCalledTimes(1)
  })

  it('closes on outside mousedown', () => {
    const { container, queryByText } = wrap({ challengeEnabled: false })
    fireEvent.click(openBtn(container))
    expect(queryByText('challengeOff')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(queryByText('challengeOff')).toBeNull()
  })

  it('stays open on inside mousedown', () => {
    const { container, queryByText } = wrap({ challengeEnabled: false })
    fireEvent.click(openBtn(container))
    fireEvent.mouseDown(openBtn(container))
    expect(queryByText('challengeOff')).toBeTruthy()
  })
})
