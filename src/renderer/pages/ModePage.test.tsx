import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import type { MidiFileData } from '@/types'

// ─── Controllable AppContext ──────────────────────────────────────────────
// ModePage reads midiFile / resumePoints and calls setPracticeSettings +
// navigate. We drive those through a mutable object so each test can set up
// the branch it wants (no midiFile → redirect, resumePoint present → banner).
// @/audio → tone, which is broken in this jsdom env. Stub the engine so any
// transitive import (via @/practice, @/components/header) resolves cleanly.
vi.mock('@/audio', () => ({ audioEngine: {}, pedal: {} }))

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const appState: {
  midiFile: MidiFileData | null
  resumePoints: Record<string, { time: number; mode: string } | undefined>
} = { midiFile: null, resumePoints: {} }

const setResumePoint = vi.fn()
const setPracticeSettings = vi.fn()

vi.mock('@/context', () => ({
  useAppContext: () => ({
    midiFile: appState.midiFile,
    resumePoints: appState.resumePoints,
    setResumePoint,
    setPracticeSettings,
  }),
}))

// Leaderboard best-score lookup — controllable per test.
const bestScore: { value: { score: number } | null } = { value: null }
vi.mock('@/practice', async (orig) => {
  const actual = await orig<typeof import('@/practice')>()
  return {
    ...actual,
    getBestScore: () => bestScore.value,
    useChallengeEnabled: () => [false, vi.fn()],
  }
})

// LeaderboardModal pulls in its own score store + styles; stub to a marker.
vi.mock('@/components/library', () => ({
  LeaderboardModal: ({ songName }: { songName: string }) => (
    <div data-testid="leaderboard">{songName}</div>
  ),
}))

import { LanguageProvider } from '@/i18n'
import ModePage from './ModePage'

const midi = (over: Partial<MidiFileData> = {}): MidiFileData => ({
  name: 'Song.mid', duration: 100, bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  notes: [], trackCount: 1, ...over,
})

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter><ModePage /></MemoryRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  navigateMock.mockClear()
  setResumePoint.mockClear()
  setPracticeSettings.mockClear()
  appState.midiFile = null
  appState.resumePoints = {}
  bestScore.value = null
})
afterEach(cleanup)

describe('ModePage — guard', () => {
  it('renders nothing and redirects to / when no midiFile', () => {
    const { container } = renderPage()
    expect(container.textContent).toBe('')
    expect(navigateMock).toHaveBeenCalledWith('/')
  })
})

describe('ModePage — populated', () => {
  it('renders song header (name + BPM) and the three hand sections', () => {
    appState.midiFile = midi({ name: 'My Tune.mid', bpm: 90 })
    const { getByText, getAllByRole } = renderPage()
    expect(getByText('My Tune.mid')).toBeTruthy()
    expect(getByText('90 BPM')).toBeTruthy()
    // right / left / both → 3 hand sections, each with 3 skill cards + the
    // featured view-listen card → buttons present.
    expect(getAllByRole('button').length).toBeGreaterThan(9)
  })

  it('clicking the featured view-listen card starts a fresh session and navigates', () => {
    appState.midiFile = midi({ name: 'X.mid' })
    const { getByText } = renderPage()
    // The featured card's title span holds "Xem và Nghe"; click its button.
    fireEvent.click(getByText('Xem và Nghe').closest('button') as HTMLElement)
    expect(setResumePoint).toHaveBeenCalledWith('X.mid', null)
    expect(setPracticeSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'view-listen' }),
    )
    expect(navigateMock).toHaveBeenCalledWith('/practice')
  })
})

describe('ModePage — resume banner branch', () => {
  it('hides the resume banner when there is no resume point for the song', () => {
    appState.midiFile = midi({ name: 'NoResume.mid' })
    const { queryByText } = renderPage()
    // The "Tiếp tục" (continue) action only exists inside the resume banner.
    expect(queryByText('Tiếp tục')).toBeNull()
  })

  it('shows the resume banner when a resume point exists for the song', () => {
    appState.midiFile = midi({ name: 'Resume.mid' })
    appState.resumePoints = { 'Resume.mid': { time: 42, mode: 'right-melody' } }
    const { container } = renderPage()
    // The banner renders a formatted time (mm:ss) — 42s → 0:42.
    expect(container.textContent).toContain('0:42')
  })
})

describe('ModePage — leaderboard', () => {
  it('shows best-score badge when a score exists, opens modal on click', () => {
    appState.midiFile = midi({ name: 'Scored.mid' })
    bestScore.value = { score: 87.6 }
    const { getByText, getByTestId, queryByTestId } = renderPage()
    expect(getByText('88')).toBeTruthy() // Math.round(87.6)
    expect(queryByTestId('leaderboard')).toBeNull()
    // The "88" badge lives inside the leaderboard button; click it to open.
    fireEvent.click(getByText('88').closest('button') as HTMLElement)
    expect(getByTestId('leaderboard').textContent).toBe('Scored.mid')
  })
})
