import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { LanguageProvider } from '@/i18n'
import type { ScoreEntry } from '@/practice/leaderboard'
import type { PracticeMode } from '@/types'

// The @/practice barrel transitively imports the Tone.js audio engine, which
// can't load under jsdom. Re-expose only the leaderboard + mode helpers the
// modal needs from their concrete (audio-free) sub-modules — keeping the REAL
// localStorage-backed scoring logic so clear/keep branches exercise it.
vi.mock('@/practice', async () => {
  const lb = await vi.importActual<typeof import('@/practice/leaderboard')>('@/practice/leaderboard')
  const mode = await vi.importActual<typeof import('@/practice/mode')>('@/practice/mode')
  return { ...lb, ...mode }
})

import LeaderboardModal from './LeaderboardModal'
import { addScore, getScores, clearScores } from '@/practice/leaderboard'

const SONG = 'TestSong'

function entry(over: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    score: 100, success: 10, missed: 0, combosHits: 5, maxCombo: 5,
    totalNotes: 10, accuracy: 0.9, mode: 'right-melody' as PracticeMode,
    date: 1700000000000, loopRegion: null, ...over,
  }
}

function renderModal(onClose = vi.fn()) {
  return { onClose, ...render(
    <LanguageProvider>
      <LeaderboardModal songName={SONG} onClose={onClose} />
    </LanguageProvider>,
  ) }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('biasno.lang', 'en')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('LeaderboardModal', () => {
  it('shows the empty state when there are no scores', () => {
    const { getByText } = renderModal()
    expect(getByText(/No runs yet/i)).toBeTruthy()
  })

  it('renders rows sorted by score and a best-score header', () => {
    addScore(SONG, entry({ score: 50, accuracy: 0.5, date: 1 }))
    addScore(SONG, entry({ score: 200, accuracy: 0.8, date: 2 }))
    const { getByText, getAllByText, container } = renderModal()
    expect(getByText('Best score')).toBeTruthy()
    expect(getAllByText('200').length).toBeGreaterThanOrEqual(1) // best score in header + row
    const firstRow = container.querySelector('tbody tr')
    expect(firstRow?.textContent).toContain('200') // top row is highest score
    expect(firstRow?.textContent).toContain('🥇')
  })

  it('renders a loop-region pill when a score has a loopRegion', () => {
    addScore(SONG, entry({ loopRegion: { startSec: 5, endSec: 10 } }))
    const { container } = renderModal()
    expect(container.textContent).toContain('↻')
  })

  it('shows view-listen rows with the short label', () => {
    addScore(SONG, entry({ mode: 'view-listen' as PracticeMode }))
    const { container } = renderModal()
    // view-listen path of rowModeLabel; just assert a row rendered.
    expect(container.querySelector('tbody tr')).toBeTruthy()
  })

  it('caps the visible list at 20 rows', () => {
    for (let i = 0; i < 25; i++) addScore(SONG, entry({ score: i, date: i }))
    const { container } = renderModal()
    expect(container.querySelectorAll('tbody tr').length).toBe(20)
  })

  it('Escape calls onClose', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('non-Escape keydown does not close', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('backdrop click closes; card click does not', () => {
    const { onClose, container } = renderModal()
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement
    const card = container.querySelector('.lbCard') as HTMLElement
    fireEvent.click(card)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clear-all (total + all) wipes every score', () => {
    addScore(SONG, entry({ mode: 'right-melody' as PracticeMode }))
    addScore(SONG, entry({ mode: 'left-rhythm' as PracticeMode }))
    const { getByText } = renderModal()
    fireEvent.click(getByText(/Clear leaderboard/i)) // enter confirming
    fireEvent.click(getByText('Delete'))
    expect(getScores(SONG)).toHaveLength(0)
  })

  it('scoped clear keeps scores outside the selected skill', () => {
    // Two skills; select the "melody" tab then clear only it.
    addScore(SONG, entry({ mode: 'right-melody' as PracticeMode, score: 10 }))
    addScore(SONG, entry({ mode: 'right-rhythm' as PracticeMode, score: 20 }))
    const { getByText } = renderModal()
    fireEvent.click(getByText('Melody')) // skillTab = melody (non-total)
    fireEvent.click(getByText(/Clear leaderboard/i))
    fireEvent.click(getByText('Delete'))
    const left = getScores(SONG)
    // melody removed, rhythm kept
    expect(left).toHaveLength(1)
    expect(left[0].mode).toBe('right-rhythm')
  })

  it('cancel in confirming state aborts the clear', () => {
    addScore(SONG, entry())
    const { getByText, getAllByText } = renderModal()
    fireEvent.click(getByText(/Clear leaderboard/i))
    // Two "Cancel" buttons appear (confirm-cancel + footer close); first is the
    // confirm cancel.
    fireEvent.click(getAllByText('Cancel')[0])
    expect(getScores(SONG)).toHaveLength(1)
  })

  it('hides the hand-filter tabs while on the total tab and shows them otherwise', () => {
    addScore(SONG, entry({ mode: 'right-melody' as PracticeMode }))
    const { getByText, queryByText } = renderModal()
    expect(queryByText('Both hands')).toBeNull() // total tab: no hand tabs
    fireEvent.click(getByText('Melody'))
    expect(getByText('Both hands')).toBeTruthy()
  })

  it('resets the hand tab back to all when the skill tab changes', () => {
    addScore(SONG, entry({ mode: 'right-melody' as PracticeMode, score: 10 }))
    addScore(SONG, entry({ mode: 'left-melody' as PracticeMode, score: 20 }))
    const { getByText, container } = renderModal()
    fireEvent.click(getByText('Melody'))
    fireEvent.click(getByText('Left hand')) // narrows to left
    expect(container.querySelectorAll('tbody tr').length).toBe(1)
    fireEvent.click(getByText('Rhythm'))   // skill change resets hand -> all
    fireEvent.click(getByText('Melody'))   // back to melody, hand should be all
    expect(container.querySelectorAll('tbody tr').length).toBe(2)
  })

  afterEach(() => clearScores(SONG))
})
