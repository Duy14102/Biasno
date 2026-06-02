import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// @/audio → tone (broken in jsdom).
vi.mock('@/audio', () => ({
  audioEngine: {
    startMetronome: vi.fn(), stopMetronome: vi.fn(), stopAll: vi.fn(),
    restoreVolume: vi.fn(),
  },
}))
vi.mock('@/hooks', () => ({ useAudioEngine: vi.fn() }))
// @/practice index transitively imports tone; only KEYBOARD_HEIGHT is used.
vi.mock('@/practice', () => ({ KEYBOARD_HEIGHT: 120 }))
vi.mock('@/context', () => ({ useMidi: () => ({ connectedId: null, devices: [] }) }))

// ─── Library store (localStorage CRUD) — controllable entry list ──────────
const store: { entries: { id: string; name: string }[] } = { entries: [] }
const emptySnapshot = {
  notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0, clips: [], pedalEvents: [],
}
// Drive snapshot.clips.length so we can hit both handleClipDelete branches.
const freeModeState: { clips: unknown[] } = { clips: [] }
const clearFn = vi.fn()
const deleteClipAtFn = vi.fn()

vi.mock('@/freeMode', () => ({
  listEntries: () => store.entries,
  getEntry: (id: string) => store.entries.find((e) => e.id === id) ?? null,
  createEntry: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn(),
  buildMidi: vi.fn(), buildMusicXml: vi.fn(), buildSheetHtml: vi.fn(),
  useFreeMode: () => ({
    isRecording: false,
    snapshot: { ...emptySnapshot, clips: freeModeState.clips },
    canUndo: false, canRedo: false,
    startRecord: vi.fn(), continueRecord: vi.fn(), stopRecord: vi.fn(),
    clear: clearFn, playInput: vi.fn(),
    setTrimStart: vi.fn(), setTrimEnd: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    replaceSnapshot: vi.fn(), splitClipAt: vi.fn(), deleteClipAt: deleteClipAtFn,
    setClipVolumeAt: vi.fn(), toggleLockAt: vi.fn(), setClipCommentAt: vi.fn(),
    copyClipAt: vi.fn(), pasteClipAt: vi.fn(), moveClipTo: vi.fn(), clipboard: null,
  }),
  useFreePlayback: () => ({
    isPlaying: false, play: vi.fn(), stop: vi.fn(), seek: vi.fn(), headMs: 0,
  }),
}))

// ─── Children stubs ───────────────────────────────────────────────────────
vi.mock('@/components/freeMode', () => ({
  FreeModeHeader: ({ libraryCount, onOpenLibrary }: {
    libraryCount: number; onOpenLibrary: () => void
  }) => (
    <header data-testid="header">
      <span data-testid="lib-count">{libraryCount}</span>
      <button onClick={onOpenLibrary}>open-library</button>
    </header>
  ),
  RecorderPanel: ({ clipActions }: { clipActions: { onDelete: (ms: number) => void } }) => (
    <div data-testid="recorder">
      <button onClick={() => clipActions.onDelete(0)}>delete-clip</button>
    </div>
  ),
  LibraryModal: ({ entries }: { entries: { id: string }[] }) => (
    <div data-testid="library-modal">{entries.length}</div>
  ),
  ClearConfirmModal: ({ onConfirm }: { onConfirm: () => void }) => (
    <div data-testid="clear-modal"><button onClick={onConfirm}>confirm-clear</button></div>
  ),
}))
vi.mock('@/components/keyboard', () => ({ PianoKeyboard: () => <div data-testid="keyboard" /> }))
vi.mock('@/components/header', () => ({ PlayIcon: () => <svg /> }))

import { LanguageProvider } from '@/i18n'
import FreeModePage from './FreeModePage'

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter><FreeModePage /></MemoryRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  store.entries = []
  freeModeState.clips = []
  clearFn.mockClear()
  deleteClipAtFn.mockClear()
})
afterEach(cleanup)

describe('FreeModePage — mount + library', () => {
  it('mounts core scaffolding (header, recorder, keyboard)', () => {
    const { getByTestId } = renderPage()
    expect(getByTestId('header')).toBeTruthy()
    expect(getByTestId('recorder')).toBeTruthy()
    expect(getByTestId('keyboard')).toBeTruthy()
  })

  it('passes the library entry count to the header', () => {
    store.entries = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }]
    const { getByTestId } = renderPage()
    expect(getByTestId('lib-count').textContent).toBe('2')
  })

  it('library modal is hidden until opened, then shows entries', () => {
    store.entries = [{ id: '1', name: 'a' }]
    const { queryByTestId, getByText, getByTestId } = renderPage()
    expect(queryByTestId('library-modal')).toBeNull()
    fireEvent.click(getByText('open-library'))
    expect(getByTestId('library-modal').textContent).toBe('1')
  })
})

describe('FreeModePage — clip delete → whole-recording confirm branch', () => {
  it('with ≤1 clip, deleting opens the clear-confirm modal (not deleteClipAt)', () => {
    freeModeState.clips = [{}] // length 1 → whole-delete path
    const { getByText, getByTestId } = renderPage()
    expect(getByTestId('recorder')).toBeTruthy()
    fireEvent.click(getByText('delete-clip'))
    expect(getByTestId('clear-modal')).toBeTruthy()
    expect(deleteClipAtFn).not.toHaveBeenCalled()
    // Confirming runs clear().
    fireEvent.click(getByText('confirm-clear'))
    expect(clearFn).toHaveBeenCalled()
  })

  it('with >1 clip, deleting calls deleteClipAt and shows no confirm modal', () => {
    freeModeState.clips = [{}, {}] // length 2 → single-clip delete path
    const { getByText, queryByTestId } = renderPage()
    fireEvent.click(getByText('delete-clip'))
    expect(deleteClipAtFn).toHaveBeenCalledWith(0)
    expect(queryByTestId('clear-modal')).toBeNull()
  })
})
