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

  // Scan a folder for .mid / .midi files.  `null` means the folder is gone /
  // unreadable (caller should preserve cached entries); `[]` means empty.
  scanMidiFolder: (folderPath: string): Promise<MidiFileRef[] | null> =>
    ipcRenderer.invoke('fs:scanMidi', folderPath),

  // Read a MIDI file by path → ArrayBuffer
  readMidiFile: (filePath: string): Promise<ArrayBuffer | null> =>
    ipcRenderer.invoke('fs:readMidi', filePath),

  // App data path (for audio sample cache)
  getDataPath: (): Promise<string> => ipcRenderer.invoke('app:getDataPath'),

  // Resolve a dropped File's absolute filesystem path.  Electron 32+ removed
  // the legacy `file.path` field; webUtils.getPathForFile is the replacement.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // Folder watching — debounced in main; `onFolderChanged` returns an
  // unsubscribe so callers don't leak listeners on unmount.
  watchFolder:   (folderPath: string): Promise<void> => ipcRenderer.invoke('fs:watchFolder', folderPath),
  unwatchFolder: (): Promise<void>                    => ipcRenderer.invoke('fs:unwatchFolder'),
  onFolderChanged: (cb: (folderPath: string) => void): (() => void) => {
    const handler = (_e: unknown, p: string): void => cb(p)
    ipcRenderer.on('fs:folderChanged', handler)
    return () => { ipcRenderer.removeListener('fs:folderChanged', handler) }
  },

  // Free Mode export — three save-to-disk paths (binary, text, HTML→PDF).
  // Each returns false if the user cancels the save dialog.
  saveBuffer: (defaultName: string, kind: 'mid' | 'musicxml', buf: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('dialog:saveBuffer', defaultName, kind, buf),
  saveText:   (defaultName: string, kind: 'mid' | 'musicxml', text: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:saveText',   defaultName, kind, text),
  savePdfFromHtml: (defaultName: string, html: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:savePdfFromHtml', defaultName, html),
})

declare global {
  interface Window {
    electronAPI: {
      openMidiFile: () => Promise<{ name: string; buffer: ArrayBuffer; path: string } | null>
      openFolder: () => Promise<string | null>
      scanMidiFolder: (folderPath: string) => Promise<MidiFileRef[] | null>
      readMidiFile: (filePath: string) => Promise<ArrayBuffer | null>
      getDataPath: () => Promise<string>
      getPathForFile: (file: File) => string
      watchFolder: (folderPath: string) => Promise<void>
      unwatchFolder: () => Promise<void>
      onFolderChanged: (cb: (folderPath: string) => void) => (() => void)
      saveBuffer: (defaultName: string, kind: 'mid' | 'musicxml', buf: ArrayBuffer) => Promise<boolean>
      saveText:   (defaultName: string, kind: 'mid' | 'musicxml', text: string) => Promise<boolean>
      savePdfFromHtml: (defaultName: string, html: string) => Promise<boolean>
    }
  }
}
