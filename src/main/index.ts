import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync, mkdirSync, readdirSync, watch, type FSWatcher } from 'fs'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 620,
    show: false,
    backgroundColor: '#0a0f1e',
    // Use native titlebar — avoids overlap with window controls
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // allow CDN audio samples
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── IPC: Open single MIDI file ───────────────────────────────────────────────
ipcMain.handle('dialog:openMidi', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Chọn file MIDI',
    filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const filePath = result.filePaths[0]
  const buffer   = readFileSync(filePath)
  const fileName = filePath.split(/[\\/]/).pop()!.replace(/\.(mid|midi)$/i, '')
  return {
    name: fileName,
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    path: filePath
  }
})

// ─── IPC: Open folder dialog ──────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Chọn thư mục chứa file MIDI',
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Scan folder for MIDI files ─────────────────────────────────────────
// Returns `null` when the folder is missing / unreadable so the renderer can
// distinguish "folder gone" (preserve persisted entries) from "folder empty"
// (drop entries).  Without this, unplugging a USB drive would silently wipe
// the saved library.
ipcMain.handle('fs:scanMidi', async (_event, folderPath: string) => {
  try {
    if (!existsSync(folderPath)) return null
    const entries = readdirSync(folderPath, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && /\.(mid|midi)$/i.test(e.name))
      .map((e) => ({
        name: e.name.replace(/\.(mid|midi)$/i, ''),
        path: join(folderPath, e.name)
      }))
  } catch {
    return null
  }
})

// ─── IPC: Watch a folder for MIDI file changes ───────────────────────────────
// Single watcher process-wide — switching folders closes the previous one.
// `fs.watch` fires multiple events per file operation (especially on Windows
// where editors write atomically), so we debounce before notifying the
// renderer.  The renderer just re-scans on every signal.
let folderWatcher:  FSWatcher              | null = null
let folderWatchDebounce: NodeJS.Timeout    | null = null

function stopWatching(): void {
  if (folderWatcher) {
    try { folderWatcher.close() } catch { /* already closed */ }
    folderWatcher = null
  }
  if (folderWatchDebounce) {
    clearTimeout(folderWatchDebounce)
    folderWatchDebounce = null
  }
}

ipcMain.handle('fs:watchFolder', (event, folderPath: string) => {
  stopWatching()
  if (!folderPath || !existsSync(folderPath)) return
  try {
    folderWatcher = watch(folderPath, { persistent: false }, (_evt, filename) => {
      // Ignore unrelated files; only MIDI changes need a re-scan.
      if (filename && !/\.(mid|midi)$/i.test(String(filename))) return
      if (folderWatchDebounce) clearTimeout(folderWatchDebounce)
      folderWatchDebounce = setTimeout(() => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('fs:folderChanged', folderPath)
        }
      }, 400)
    })
  } catch (err) {
    console.warn('[watchFolder]', err)
  }
})

ipcMain.handle('fs:unwatchFolder', () => stopWatching())

// ─── IPC: Read a MIDI file by path ────────────────────────────────────────────
ipcMain.handle('fs:readMidi', async (_event, filePath: string) => {
  try {
    const buffer = readFileSync(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } catch {
    return null
  }
})

// ─── IPC: App data path for caching ──────────────────────────────────────────
ipcMain.handle('app:getDataPath', () => {
  const p = join(app.getPath('userData'), 'samples')
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
  return p
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)  // Remove File/Help/Edit menu bar
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopWatching()
  if (process.platform !== 'darwin') app.quit()
})
