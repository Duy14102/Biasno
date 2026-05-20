import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, watch, type FSWatcher } from 'fs'

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

// ─── IPC: Free Mode — save MIDI buffer to a user-chosen path ─────────────────
type ExportKind = 'mid' | 'musicxml'

function filterFor(kind: ExportKind): Electron.FileFilter[] {
  if (kind === 'mid')      return [{ name: 'MIDI Files',     extensions: ['mid'] }]
  /* musicxml */           return [{ name: 'MusicXML Files', extensions: ['musicxml', 'xml'] }]
}

ipcMain.handle('dialog:saveBuffer', async (_e, defaultName: string, kind: ExportKind, buffer: ArrayBuffer) => {
  const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: filterFor(kind) })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, Buffer.from(buffer))
  return true
})

ipcMain.handle('dialog:saveText', async (_e, defaultName: string, kind: ExportKind, text: string) => {
  const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: filterFor(kind) })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, text, 'utf-8')
  return true
})

// Render an HTML document (containing the OSMD-rendered SVG) to PDF via a
// hidden BrowserWindow + webContents.printToPDF.  The hidden window is
// destroyed before this handler returns; nothing leaks if the user cancels
// the save dialog mid-way.
ipcMain.handle('dialog:savePdfFromHtml', async (_e, defaultName: string, html: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) return false

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  try {
    await win.loadURL('data:text/html;base64,' + Buffer.from(html, 'utf-8').toString('base64'))
    // Wait for webfonts to finish loading before rasterising — otherwise the
    // PDF captures the fallback Times instead of EB Garamond.  500 ms cap so
    // we don't hang forever if Google Fonts is unreachable.
    try {
      await win.webContents.executeJavaScript(
        'Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(() => true)',
        true,
      )
    } catch { /* ignore — proceed with whatever fonts loaded */ }
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
    writeFileSync(result.filePath, pdf)
    return true
  } finally {
    win.destroy()
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
