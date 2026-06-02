import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const nav = vi.hoisted(() => vi.fn())
const sheet = vi.hoisted(() => ({ preloadSheet: vi.fn(), hasCachedSheetByName: vi.fn(() => false), evictSheetByName: vi.fn() }))
const parse = vi.hoisted(() => vi.fn())
const appCtx = vi.hoisted(() => ({
  setMidiFile: vi.fn(), updateFileList: vi.fn(), setFolderPath: vi.fn(),
  folderPath: null as string | null, fileList: [] as Array<{ name: string; path: string }>,
  hiddenPaths: new Set<string>(), addHiddenPath: vi.fn(), removeHiddenPath: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('@/utils', () => ({ parseMidiBuffer: parse }))
vi.mock('@/components/sheet', () => sheet)
vi.mock('@/context', () => ({ useAppContext: () => appCtx }))
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))

import { useFileLibrary } from './useFileLibrary'
import type { FileEntry } from '@/context'

const electron = {
  readMidiFile: vi.fn(), openMidiFile: vi.fn(), openFolder: vi.fn(),
  scanMidiFolder: vi.fn(), watchFolder: vi.fn(), unwatchFolder: vi.fn(),
  onFolderChanged: vi.fn(() => () => {}), getPathForFile: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  appCtx.folderPath = null
  appCtx.fileList = []
  appCtx.hiddenPaths = new Set()
  ;(window as unknown as { electronAPI: typeof electron }).electronAPI = electron
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
})
afterEach(() => vi.unstubAllGlobals())

const entry: FileEntry = { name: 'Song', path: 'C:/song.mid' }

describe('useFileLibrary.selectFile', () => {
  it('sets a generic read error when the buffer comes back null', async () => {
    electron.readMidiFile.mockResolvedValue(null)
    const { result } = renderHook(() => useFileLibrary())
    await act(async () => { await result.current.selectFile(entry) })
    expect(result.current.error).toBe('errCantReadMidiFile')
    expect(nav).not.toHaveBeenCalled()
  })

  it('rejects a MIDI with zero notes', async () => {
    electron.readMidiFile.mockResolvedValue(new ArrayBuffer(8))
    parse.mockResolvedValue({ notes: [], duration: 0 })
    const { result } = renderHook(() => useFileLibrary())
    await act(async () => { await result.current.selectFile(entry) })
    expect(result.current.error).toBe('errEmptyMidi')
  })

  it('loads, preloads and navigates on a valid file', async () => {
    electron.readMidiFile.mockResolvedValue(new ArrayBuffer(8))
    const data = { notes: [{}], duration: 12 }
    parse.mockResolvedValue(data)
    const { result } = renderHook(() => useFileLibrary())
    await act(async () => { await result.current.selectFile(entry) })
    expect(appCtx.setMidiFile).toHaveBeenCalledWith(data)
    expect(sheet.preloadSheet).toHaveBeenCalledWith(data)
    expect(nav).toHaveBeenCalledWith('/mode')
  })

  it('captures a thrown error into the error state (catch branch)', async () => {
    electron.readMidiFile.mockRejectedValue(new Error('disk fail'))
    const { result } = renderHook(() => useFileLibrary())
    await act(async () => { await result.current.selectFile(entry) })
    expect(result.current.error).toBe('errGeneric')
  })
})

describe('useFileLibrary delete plumbing', () => {
  it('requestDelete then cancelDelete toggles pendingDelete', () => {
    const { result } = renderHook(() => useFileLibrary())
    act(() => result.current.requestDelete(entry))
    expect(result.current.pendingDelete).toEqual(entry)
    act(() => result.current.cancelDelete())
    expect(result.current.pendingDelete).toBeNull()
  })

  it('confirmDelete removes the row, evicts the sheet and hides the path', () => {
    const { result } = renderHook(() => useFileLibrary())
    act(() => result.current.requestDelete(entry))
    act(() => result.current.confirmDelete())
    expect(appCtx.updateFileList).toHaveBeenCalled()
    expect(sheet.evictSheetByName).toHaveBeenCalledWith('Song')
    expect(appCtx.addHiddenPath).toHaveBeenCalledWith('C:/song.mid')
    expect(result.current.pendingDelete).toBeNull()
  })

  it('confirmDelete is a no-op with nothing pending', () => {
    const { result } = renderHook(() => useFileLibrary())
    act(() => result.current.confirmDelete())
    expect(appCtx.updateFileList).not.toHaveBeenCalled()
  })
})

describe('useFileLibrary.dropFiles', () => {
  const dragEvt = (files: File[]) => ({
    preventDefault: vi.fn(),
    dataTransfer: { files },
  }) as unknown as React.DragEvent

  it('errors when no files are dropped', async () => {
    const { result } = renderHook(() => useFileLibrary())
    await act(async () => { await result.current.dropFiles(dragEvt([])) })
    expect(result.current.error).toBe('errNoFilesDragged')
  })

  it('errors when dropped files are not MIDI', async () => {
    const f = new File(['x'], 'note.txt')
    const { result } = renderHook(() => useFileLibrary())
    await act(async () => { await result.current.dropFiles(dragEvt([f])) })
    expect(result.current.error).toBe('errNotMidiDragged')
  })
})
