import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface MidiFileRef {
  name: string
  path: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Open single MIDI file dialog
  openMidiFile: (): Promise<{ name: string; buffer: ArrayBuffer; path: string } | null> =>
    ipcRenderer.invoke('dialog:openMidi'),

  // Open folder picker dialog
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFolder'),

  // Scan a folder for .mid / .midi files
  scanMidiFolder: (folderPath: string): Promise<MidiFileRef[]> =>
    ipcRenderer.invoke('fs:scanMidi', folderPath),

  // Read a MIDI file by path → ArrayBuffer
  readMidiFile: (filePath: string): Promise<ArrayBuffer | null> =>
    ipcRenderer.invoke('fs:readMidi', filePath),

  // App data path (for audio sample cache)
  getDataPath: (): Promise<string> => ipcRenderer.invoke('app:getDataPath'),

  // Resolve a dropped File's absolute filesystem path.  Electron 32+ removed
  // the legacy `file.path` field; webUtils.getPathForFile is the replacement.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
})

declare global {
  interface Window {
    electronAPI: {
      openMidiFile: () => Promise<{ name: string; buffer: ArrayBuffer; path: string } | null>
      openFolder: () => Promise<string | null>
      scanMidiFolder: (folderPath: string) => Promise<MidiFileRef[]>
      readMidiFile: (filePath: string) => Promise<ArrayBuffer | null>
      getDataPath: () => Promise<string>
      getPathForFile: (file: File) => string
    }
  }
}
