import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { MidiFileData, PracticeSettings, PracticeMode } from '../types'

const LS_FILE_LIST     = 'biasno.fileList'
const LS_FOLDER_PATH   = 'biasno.folderPath'
const LS_HIDDEN_PATHS  = 'biasno.hiddenPaths'
export const LS_RESUME_POINTS = 'biasno.resumePoints'

function loadFileList(): FileEntry[] {
  try {
    const raw = localStorage.getItem(LS_FILE_LIST)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function loadFolderPath(): string | null {
  try { return localStorage.getItem(LS_FOLDER_PATH) } catch { return null }
}

function loadHiddenPaths(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_HIDDEN_PATHS)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch { return new Set() }
}

function loadResumePoints(): ResumePoints {
  try {
    const raw = localStorage.getItem(LS_RESUME_POINTS)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch { return {} }
}

export interface FileEntry {
  name: string
  path: string
  duration?: number
  // 'import' = user explicitly picked / dropped this file → removing it just
  //            forgets the entry (the file on disk is untouched).
  // 'folder' = picked up from a chosen folder scan → removing also just
  //            forgets the entry from the list; the file in the folder stays.
  // The two are distinguished visually (icon) and the delete-confirm modal
  // shows a different message to make the difference clear.
  source?:   'import' | 'folder'
}

export interface ResumePoint {
  time: number
  mode: PracticeMode
}

// Resume points are stored per-song so each MIDI keeps its own bookmark.
// Switching songs on the home page must never inherit another song's
// resume time — that was the bug where a 0:27 mark on song A showed up
// on song B's mode page.
export type ResumePoints = Partial<Record<string /* midiName */, ResumePoint>>

// UI preferences (sheet / falling-notes visibility) scoped per (song, mode).
// Key is `${midiName}|${mode}` so each song keeps independent toggle state for
// each mode — switching to a fresh song / mode falls back to defaults rather
// than carrying over whatever was last set on something unrelated.
export interface ModePrefs {
  showSheetMusic:   boolean
  showFallingNotes: boolean
}

interface AppState {
  midiFile:          MidiFileData                    | null
  practiceSettings:  PracticeSettings                | null
  fileList:          FileEntry[]
  folderPath:        string                          | null
  // Absolute paths of files the user has explicitly removed from the song
  // list.  syncFolder consults this when scanning a folder so a deleted
  // file never silently reappears after app reopen / fs.watch ping.  Re-
  // adding the file via Import / drop unhides it.
  hiddenPaths:       Set<string>
  resumePoints:      ResumePoints                       // keyed by midi name
  modePrefs:         Partial<Record<string, ModePrefs>>   // keyed by `${midiName}|${mode}`
}

interface AppContextValue extends AppState {
  setMidiFile:         (file: MidiFileData | null)                       => void
  setPracticeSettings: (s: PracticeSettings | null)                      => void
  setFileList:         (files: FileEntry[])                              => void
  updateFileList:      (fn: (prev: FileEntry[]) => FileEntry[])          => void
  setFolderPath:       (path: string | null)                             => void
  addHiddenPath:       (path: string)                                    => void
  removeHiddenPath:    (path: string)                                    => void
  setResumePoint:      (midiName: string, rp: ResumePoint | null)        => void
  setModePrefs:        (key: string, prefs: Partial<ModePrefs>)          => void
  clearAll:            ()                                                 => void
}

/** Compose the storage key used by ModePrefs lookups. */
export function modePrefsKey(midiName: string, mode: PracticeMode): string {
  return `${midiName}|${mode}`
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [midiFile,         setMidiFile]         = useState<MidiFileData | null>(null)
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null)
  const [fileList,         setFileList]         = useState<FileEntry[]>(loadFileList)
  const [folderPath,       setFolderPath]       = useState<string | null>(loadFolderPath)
  const [hiddenPaths,      setHiddenPaths]      = useState<Set<string>>(loadHiddenPaths)

  useEffect(() => {
    try { localStorage.setItem(LS_FILE_LIST, JSON.stringify(fileList)) } catch { /* quota */ }
  }, [fileList])

  useEffect(() => {
    try {
      if (folderPath === null) localStorage.removeItem(LS_FOLDER_PATH)
      else                     localStorage.setItem(LS_FOLDER_PATH, folderPath)
    } catch { /* quota */ }
  }, [folderPath])

  useEffect(() => {
    try {
      localStorage.setItem(LS_HIDDEN_PATHS, JSON.stringify([...hiddenPaths]))
    } catch { /* quota */ }
  }, [hiddenPaths])

  const addHiddenPath = useCallback((path: string) => {
    setHiddenPaths((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev); next.add(path); return next
    })
  }, [])
  const removeHiddenPath = useCallback((path: string) => {
    setHiddenPaths((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev); next.delete(path); return next
    })
  }, [])
  const [resumePoints,     setAllResumePoints] = useState<ResumePoints>(loadResumePoints)

  useEffect(() => {
    try { localStorage.setItem(LS_RESUME_POINTS, JSON.stringify(resumePoints)) } catch { /* quota */ }
  }, [resumePoints])
  const [modePrefs,        setAllModePrefs]    = useState<Partial<Record<string, ModePrefs>>>({})

  const updateFileList = useCallback((fn: (prev: FileEntry[]) => FileEntry[]) => {
    setFileList(fn)
  }, [])

  // Per-song resume point.  Passing rp=null clears just that song's bookmark
  // (used right after we consume it on entering practice, or when the user
  // taps "Bỏ qua" on the mode page).
  const setResumePoint = useCallback((midiName: string, rp: ResumePoint | null) => {
    setAllResumePoints((prev) => {
      const next = { ...prev }
      if (rp === null) delete next[midiName]
      else             next[midiName] = rp
      return next
    })
  }, [])

  const setModePrefs = useCallback((key: string, prefs: Partial<ModePrefs>) => {
    setAllModePrefs((prev) => ({
      ...prev,
      [key]: {
        showSheetMusic:   prev[key]?.showSheetMusic   ?? false,
        showFallingNotes: prev[key]?.showFallingNotes ?? true,
        ...prefs,
      },
    }))
  }, [])

  const clearAll = useCallback(() => {
    setMidiFile(null)
    setPracticeSettings(null)
  }, [])

  return (
    <AppContext.Provider value={{
      midiFile, practiceSettings, fileList, folderPath, hiddenPaths, resumePoints, modePrefs,
      setMidiFile, setPracticeSettings, setFileList, updateFileList,
      setFolderPath, addHiddenPath, removeHiddenPath, setResumePoint, setModePrefs, clearAll
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
