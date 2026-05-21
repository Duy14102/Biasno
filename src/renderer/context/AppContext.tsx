import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { MidiFileData, PracticeSettings, PracticeMode } from '@/types'
import { LS } from '@/constants'
import { loadJSON, saveJSON, removeKey, isPlainObject } from '@/utils'

export interface FileEntry {
  name: string
  path: string
  duration?: number
  source?: 'import' | 'folder'
  folderPath?: string
}

export interface ResumePoint {
  time: number
  mode: PracticeMode
}

export type ResumePoints = Partial<Record<string, ResumePoint>>

export interface ModePrefs {
  showSheetMusic:   boolean
  showFallingNotes: boolean
}

interface AppState {
  midiFile:          MidiFileData                    | null
  practiceSettings:  PracticeSettings                | null
  fileList:          FileEntry[]
  folderPath:        string                          | null
  hiddenPaths:       Set<string>
  resumePoints:      ResumePoints
  modePrefs:         Partial<Record<string, ModePrefs>>
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

export function modePrefsKey(midiName: string, mode: PracticeMode): string {
  return `${midiName}|${mode}`
}

const AppContext = createContext<AppContextValue | null>(null)

const isFileEntryArray = (v: unknown): v is FileEntry[] => Array.isArray(v)
const isStringArray    = (v: unknown): v is string[]    => Array.isArray(v)

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [midiFile,         setMidiFile]         = useState<MidiFileData | null>(null)
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null)
  const [fileList,         setFileList]         = useState<FileEntry[]>(
    () => loadJSON<FileEntry[]>(LS.FILE_LIST, [], isFileEntryArray),
  )
  const [folderPath,       setFolderPath]       = useState<string | null>(
    () => { try { return localStorage.getItem(LS.FOLDER_PATH) } catch { return null } },
  )
  const [hiddenPaths,      setHiddenPaths]      = useState<Set<string>>(
    () => new Set(loadJSON<string[]>(LS.HIDDEN_PATHS, [], isStringArray)),
  )
  const [resumePoints,     setAllResumePoints]  = useState<ResumePoints>(
    () => loadJSON<ResumePoints>(LS.RESUME_POINTS, {}, isPlainObject),
  )
  const [modePrefs,        setAllModePrefs]     = useState<Partial<Record<string, ModePrefs>>>({})

  useEffect(() => { saveJSON(LS.FILE_LIST, fileList) }, [fileList])
  useEffect(() => {
    if (folderPath === null) removeKey(LS.FOLDER_PATH)
    else try { localStorage.setItem(LS.FOLDER_PATH, folderPath) } catch { /* quota */ }
  }, [folderPath])
  useEffect(() => { saveJSON(LS.HIDDEN_PATHS, [...hiddenPaths]) }, [hiddenPaths])
  useEffect(() => { saveJSON(LS.RESUME_POINTS, resumePoints) }, [resumePoints])

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

  const updateFileList = useCallback((fn: (prev: FileEntry[]) => FileEntry[]) => {
    setFileList(fn)
  }, [])

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
      setFolderPath, addHiddenPath, removeHiddenPath, setResumePoint, setModePrefs, clearAll,
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
