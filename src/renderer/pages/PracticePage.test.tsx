import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

const nav = vi.hoisted(() => vi.fn())
const ctx = vi.hoisted(() => ({
  practiceSettings: null as null | { midiFile: unknown; mode: string },
  resumePoints: {} as Record<string, unknown>,
  setResumePoint: vi.fn(), modePrefs: {}, setModePrefs: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('@/context', () => ({
  useAppContext: () => ctx,
  useMidi: () => ({ connectedId: null, devices: [] }),
  modePrefsKey: (n: string, m: string) => `${n}:${m}`,
}))
vi.mock('@/constants', () => ({ LS: { RESUME_POINTS: 'rp' } }))
vi.mock('@/utils', () => ({
  loadJSON: () => ({}), isPlainObject: () => true,
  KEY_COUNTS: [88, 76, 61], detectKeyCountFromName: () => 88,
}))
vi.mock('@/audio', () => ({
  audioEngine: {
    getVolume: () => 0.85, setVolume: vi.fn(), stopMetronome: vi.fn(),
    startMetronome: vi.fn(), updateMetronomeBpm: vi.fn(), stopFutureNodes: vi.fn(),
  },
}))
vi.mock('@/hooks', () => ({ useAudioEngine: () => ({}) }))
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }), MODE_FLASH_KEYS: {} }))
vi.mock('@/practice', () => ({
  useFlashTimer: () => ({ triggerFlash: vi.fn() }),
  useAudioScheduler: () => ({ scheduleAudio: vi.fn() }),
  usePlayhead: () => {},
  useTransport: () => ({
    seek: vi.fn(), play: vi.fn(), stop: vi.fn(),
    handlePlayPause: vi.fn(), handleRestart: vi.fn(),
    handleRewind: vi.fn(), handleFastForward: vi.fn(),
  }),
  usePracticeInput: () => ({ handleNoteInput: vi.fn() }),
  useModeChange: () => ({ modeTransitioning: false, modeFlash: null, handleModeChange: vi.fn() }),
  useViewSwap: () => ({ beginSwap: vi.fn(), phase: 'idle' }),
  useScoring: () => ({ state: { success: 0, missed: 0, score: 0 }, reset: vi.fn(), onHit: vi.fn(), onMiss: vi.fn(), onWrongAt: vi.fn() }),
  useChallengeEnabled: () => [false, vi.fn()],
  addScore: vi.fn(),
  getActiveHands: () => ['right'],
  requiresMelody: () => false,
  KEYBOARD_HEIGHT: 200, NOTE_LOOK_AHEAD_S: 4.5, LEAD_IN_TARGET: 1.25,
  PRACTICE_TRANSITION_STYLE: '',
}))
vi.mock('@/components/keyboard', () => ({ PianoKeyboard: () => <div data-testid="keyboard" /> }))
vi.mock('@/components/falling', () => ({ FallingNotes: () => <div data-testid="falling" /> }))
vi.mock('@/components/sheet', () => ({ SheetMusic: () => <div data-testid="sheet" /> }))
vi.mock('@/components', () => ({ ProgressBar: () => <div data-testid="progress" /> }))
vi.mock('@/components/header', () => ({
  PracticeHeader: ({ songName }: { songName: string }) => <div data-testid="header">{songName}</div>,
  PlayIcon: () => <svg />,
}))

import PracticePage from './PracticePage'

const midiFile = {
  name: 'Song', duration: 60, bpm: 120, notes: [{ id: 'n', time: 0.5, hand: 'right' }],
  timeSignature: { numerator: 4 },
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.practiceSettings = null
  ctx.resumePoints = {}
  localStorage.clear()
})
afterEach(cleanup)

describe('PracticePage guard', () => {
  it('shows the redirecting placeholder and navigates home when no practice settings', () => {
    const { getByText, queryByTestId } = render(<PracticePage />)
    expect(getByText('redirecting')).toBeTruthy()
    expect(queryByTestId('header')).toBeNull()
    expect(nav).toHaveBeenCalledWith('/')
  })
})

describe('PracticePage with a loaded song', () => {
  it('renders header, progress bar and keyboard', () => {
    ctx.practiceSettings = { midiFile, mode: 'view-listen' }
    const { getByTestId } = render(<PracticePage />)
    expect(getByTestId('header').textContent).toBe('Song')
    expect(getByTestId('progress')).toBeTruthy()
    expect(getByTestId('keyboard')).toBeTruthy()
  })

  it('defaults to falling notes (not the sheet) in view-listen mode', () => {
    ctx.practiceSettings = { midiFile, mode: 'view-listen' }
    const { getByTestId, queryByTestId } = render(<PracticePage />)
    expect(getByTestId('falling')).toBeTruthy()
    expect(queryByTestId('sheet')).toBeNull()
  })
})
