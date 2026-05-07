import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs'

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
ipcMain.handle('fs:scanMidi', async (_event, folderPath: string) => {
  try {
    const entries = readdirSync(folderPath, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && /\.(mid|midi)$/i.test(e.name))
      .map((e) => ({
        name: e.name.replace(/\.(mid|midi)$/i, ''),
        path: join(folderPath, e.name)
      }))
  } catch {
    return []
  }
})

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
  if (process.platform !== 'darwin') app.quit()
})
