import React, { createContext, useContext, useState, useCallback } from 'react'
import type { MidiFileData, PracticeSettings, PracticeMode } from '../types'

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
  resumePoint:       ResumePoint                     | null
  modePrefs:         Partial<Record<string, ModePrefs>>   // keyed by `${midiName}|${mode}`
}

interface AppContextValue extends AppState {
  setMidiFile:         (file: MidiFileData | null)                       => void
  setPracticeSettings: (s: PracticeSettings | null)                      => void
  setFileList:         (files: FileEntry[])                              => void
  updateFileList:      (fn: (prev: FileEntry[]) => FileEntry[])          => void
  setFolderPath:       (path: string | null)                             => void
  setResumePoint:      (rp: ResumePoint | null)                          => void
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
  const [fileList,         setFileList]         = useState<FileEntry[]>([])
  const [folderPath,       setFolderPath]       = useState<string | null>(null)
  const [resumePoint,      setResumePoint]      = useState<ResumePoint | null>(null)
  const [modePrefs,        setAllModePrefs]     = useState<Partial<Record<string, ModePrefs>>>({})

  const updateFileList = useCallback((fn: (prev: FileEntry[]) => FileEntry[]) => {
    setFileList(fn)
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
      midiFile, practiceSettings, fileList, folderPath, resumePoint, modePrefs,
      setMidiFile, setPracticeSettings, setFileList, updateFileList,
      setFolderPath, setResumePoint, setModePrefs, clearAll
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
