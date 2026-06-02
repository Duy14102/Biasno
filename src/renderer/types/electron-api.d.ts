export interface MidiFileRef {
  name: string
  path: string
}

export interface ElectronAPI {
  openMidiFile:    () => Promise<{ name: string; buffer: ArrayBuffer; path: string } | null>
  openFolder:      () => Promise<string | null>
  scanMidiFolder:  (folderPath: string) => Promise<MidiFileRef[] | null>
  readMidiFile:    (filePath: string)   => Promise<ArrayBuffer | null>
  getDataPath:     () => Promise<string>
  getSoundfont:    () => Promise<string | null>
  getPathForFile:  (file: File) => string
  watchFolder:     (folderPath: string) => Promise<void>
  unwatchFolder:   () => Promise<void>
  onFolderChanged: (cb: (folderPath: string) => void) => (() => void)
  saveBuffer:      (defaultName: string, kind: 'mid' | 'musicxml', buf: ArrayBuffer) => Promise<boolean>
  saveText:        (defaultName: string, kind: 'mid' | 'musicxml', text: string)    => Promise<boolean>
  savePdfFromHtml: (defaultName: string, html: string) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
