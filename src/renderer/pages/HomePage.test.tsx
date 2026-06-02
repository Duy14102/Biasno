import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import type { FileEntry } from '@/context'

// @/audio → tone (broken in jsdom). Stub the engine.
vi.mock('@/audio', () => ({ audioEngine: { noteOn: vi.fn(), noteOff: vi.fn() } }))

// ─── Controllable contexts ────────────────────────────────────────────────
const ctx: { fileList: FileEntry[]; folderPath: string | null } = {
  fileList: [], folderPath: null,
}
const midi: { globalError: string | null } = { globalError: null }
vi.mock('@/context', () => ({
  useAppContext: () => ctx,
  useMidi: () => ({ globalError: midi.globalError, subscribe: () => () => {} }),
}))

// ─── Library: hook + child components stubbed light ───────────────────────
const lib: {
  error: string | null
  busyAction: null
  isDragging: boolean
  pendingDelete: FileEntry | null
  pendingFolderConflict: null
  loadingFiles: Set<string>
} = {
  error: null, busyAction: null, isDragging: false,
  pendingDelete: null, pendingFolderConflict: null, loadingFiles: new Set(),
}
vi.mock('@/components/library', () => ({
  useFileLibrary: () => ({
    ...lib,
    importFile: vi.fn(), chooseFolder: vi.fn(), selectFile: vi.fn(),
    requestDelete: vi.fn(), dragOverAside: vi.fn(), dropFiles: vi.fn(),
    cancelDelete: vi.fn(), confirmDelete: vi.fn(),
    cancelFolderAdd: vi.fn(), confirmFolderAdd: vi.fn(),
  }),
  FileRow: ({ entry }: { entry: FileEntry }) => <div data-testid="filerow">{entry.name}</div>,
  LibrarySearch: () => <input data-testid="search" />,
  VirtualFileList: ({ items, renderRow }: {
    items: FileEntry[]; renderRow: (e: FileEntry) => React.ReactNode
  }) => <div data-testid="vlist">{items.map((e) => <div key={e.path}>{renderRow(e)}</div>)}</div>,
  MidiDevicePicker: () => <div data-testid="picker" />,
  DeleteConfirmModal: () => <div data-testid="delete-modal" />,
  FolderConflictModal: () => <div data-testid="folder-modal" />,
  FolderIcon: () => <svg />,
}))
vi.mock('@/components', () => ({ HomeSettings: () => <div data-testid="settings" /> }))
vi.mock('@/components/header', () => ({
  PianoIcon: () => <svg />, MusicNoteIcon: () => <svg />,
}))

import { LanguageProvider } from '@/i18n'
import HomePage from './HomePage'

const entry = (name: string, path = name): FileEntry => ({ name, path })

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter><HomePage /></MemoryRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  ctx.fileList = []
  ctx.folderPath = null
  midi.globalError = null
  lib.error = null
  lib.pendingDelete = null
  lib.isDragging = false
})
afterEach(cleanup)

describe('HomePage — library list branches', () => {
  it('empty fileList → no-songs empty state, no list, no search', () => {
    const { queryByTestId, getByText } = renderPage()
    expect(queryByTestId('vlist')).toBeNull()
    expect(queryByTestId('search')).toBeNull()
    // vi "noSongsYet" copy.
    expect(getByText('Chưa có bài nhạc nào')).toBeTruthy()
  })

  it('populated fileList → renders the virtual list with a row per file', () => {
    ctx.fileList = [entry('A.mid'), entry('B.mid')]
    const { getByTestId, getAllByTestId } = renderPage()
    expect(getByTestId('vlist')).toBeTruthy()
    expect(getAllByTestId('filerow').map((r) => r.textContent)).toEqual(['A.mid', 'B.mid'])
  })

  it('search box appears once files exist', () => {
    ctx.fileList = [entry('A.mid')]
    const { getByTestId } = renderPage()
    expect(getByTestId('search')).toBeTruthy()
  })
})

describe('HomePage — error branches', () => {
  it('shows midi globalError when present', () => {
    midi.globalError = 'MIDI blew up'
    const { getByText } = renderPage()
    expect(getByText('MIDI blew up')).toBeTruthy()
  })

  it('shows library error when present', () => {
    lib.error = 'Import failed'
    const { getByText } = renderPage()
    expect(getByText('Import failed')).toBeTruthy()
  })

  it('hides both error rows by default', () => {
    const { queryByText } = renderPage()
    expect(queryByText('MIDI blew up')).toBeNull()
    expect(queryByText('Import failed')).toBeNull()
  })
})

describe('HomePage — folder path + modals', () => {
  it('renders the folder path row when a folder is chosen', () => {
    ctx.folderPath = 'C:/songs'
    const { getByText } = renderPage()
    expect(getByText('C:/songs')).toBeTruthy()
  })

  it('omits the folder path row when none is set', () => {
    const { queryByText } = renderPage()
    expect(queryByText('C:/songs')).toBeNull()
  })

  it('renders the delete modal only when a delete is pending', () => {
    const { queryByTestId } = renderPage()
    expect(queryByTestId('delete-modal')).toBeNull()
    cleanup()
    lib.pendingDelete = entry('Z.mid')
    const r2 = renderPage()
    expect(r2.getByTestId('delete-modal')).toBeTruthy()
  })
})
