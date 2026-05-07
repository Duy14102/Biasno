import React, { createContext, useContext, useState, useCallback } from 'react'
import type { MidiFileData, PracticeSettings, PracticeMode } from '../types'

export interface FileEntry {
  name: string
  path: string
  duration?: number
}

export interface ResumePoint {
  time: number
  mode: PracticeMode
}

interface AppState {
  midiFile:          MidiFileData      | null
  practiceSettings:  PracticeSettings  | null
  fileList:          FileEntry[]
  folderPath:        string            | null
  resumePoint:       ResumePoint       | null
}

interface AppContextValue extends AppState {
  setMidiFile:         (file: MidiFileData | null)               => void
  setPracticeSettings: (s: PracticeSettings | null)              => void
  setFileList:         (files: FileEntry[])                       => void
  updateFileList:      (fn: (prev: FileEntry[]) => FileEntry[])  => void
  setFolderPath:       (path: string | null)                     => void
  setResumePoint:      (rp: ResumePoint | null)                  => void
  clearAll:            ()                                         => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [midiFile,         setMidiFile]         = useState<MidiFileData | null>(null)
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null)
  const [fileList,         setFileList]         = useState<FileEntry[]>([])
  const [folderPath,       setFolderPath]       = useState<string | null>(null)
  const [resumePoint,      setResumePoint]      = useState<ResumePoint | null>(null)

  const updateFileList = useCallback((fn: (prev: FileEntry[]) => FileEntry[]) => {
    setFileList(fn)
  }, [])

  const clearAll = useCallback(() => {
    setMidiFile(null)
    setPracticeSettings(null)
  }, [])

  return (
    <AppContext.Provider value={{
      midiFile, practiceSettings, fileList, folderPath, resumePoint,
      setMidiFile, setPracticeSettings, setFileList, updateFileList,
      setFolderPath, setResumePoint, clearAll
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
