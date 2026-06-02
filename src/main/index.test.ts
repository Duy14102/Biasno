import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock fixtures (hoisted so the electron/fs mocks can close over them) ─────
const h = vi.hoisted(() => {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)),
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    whenReady: vi.fn(() => ({ then: vi.fn() })),
    getPath: vi.fn(() => 'C:/userData'),
    appOn: vi.fn(),
    setApplicationMenu: vi.fn(),
    BrowserWindow: vi.fn(),
    // fs
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    watch: vi.fn(),
  }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    whenReady: h.whenReady,
    getPath: h.getPath,
    on: h.appOn,
    quit: vi.fn(),
  },
  BrowserWindow: Object.assign(h.BrowserWindow, { getAllWindows: () => [] }),
  ipcMain: { handle: h.handle },
  dialog: { showOpenDialog: h.showOpenDialog, showSaveDialog: h.showSaveDialog },
  shell: { openExternal: vi.fn() },
  Menu: { setApplicationMenu: h.setApplicationMenu },
}))

vi.mock('fs', () => {
  const m = {
    readFileSync: h.readFileSync,
    writeFileSync: h.writeFileSync,
    existsSync: h.existsSync,
    mkdirSync: h.mkdirSync,
    readdirSync: h.readdirSync,
    watch: h.watch,
  }
  return { ...m, default: m }
})

import './index'

const get = (ch: string) => h.handlers.get(ch)!

beforeEach(() => {
  h.readFileSync.mockReset()
  h.writeFileSync.mockReset()
  h.existsSync.mockReset()
  h.mkdirSync.mockReset()
  h.readdirSync.mockReset()
  h.showOpenDialog.mockReset()
  h.showSaveDialog.mockReset()
})

// ─── Import-time wiring ───────────────────────────────────────────────────────
describe('IPC wiring registered on import', () => {
  it('registers every expected channel exactly once', () => {
    expect([...h.handlers.keys()].sort()).toEqual(
      [
        'app:getDataPath', 'audio:getSoundfont', 'dialog:openFolder', 'dialog:openMidi',
        'dialog:saveBuffer', 'dialog:savePdfFromHtml', 'dialog:saveText',
        'fs:readMidi', 'fs:scanMidi', 'fs:unwatchFolder', 'fs:watchFolder',
      ].sort(),
    )
  })

  it('schedules app bootstrap (whenReady) on import', () => {
    expect(h.whenReady).toHaveBeenCalled()
  })
})

// ─── dialog:openMidi ──────────────────────────────────────────────────────────
describe('dialog:openMidi', () => {
  it('returns null when the dialog is canceled', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await get('dialog:openMidi')()).toBeNull()
  })

  it('returns null when no path came back despite not cancelling', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    expect(await get('dialog:openMidi')()).toBeNull()
  })

  it('strips the directory + extension to derive the name and slices the buffer', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/songs/My Song.MIDI'] })
    const u8 = new Uint8Array([1, 2, 3, 4])
    // Simulate Node Buffer view semantics (byteOffset/byteLength).
    h.readFileSync.mockReturnValue({
      buffer: u8.buffer,
      byteOffset: 0,
      byteLength: u8.byteLength,
    })
    const res = (await get('dialog:openMidi')()) as { name: string; buffer: ArrayBuffer; path: string }
    expect(res.name).toBe('My Song')
    expect(res.path).toBe('C:/songs/My Song.MIDI')
    expect(new Uint8Array(res.buffer)).toEqual(u8)
  })
})

// ─── dialog:openFolder ────────────────────────────────────────────────────────
describe('dialog:openFolder', () => {
  it('returns null on cancel', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await get('dialog:openFolder')()).toBeNull()
  })
  it('returns the first selected path otherwise', async () => {
    h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/midis'] })
    expect(await get('dialog:openFolder')()).toBe('C:/midis')
  })
})

// ─── fs:scanMidi ──────────────────────────────────────────────────────────────
describe('fs:scanMidi', () => {
  it('returns null when the folder does not exist (drive unplugged)', async () => {
    h.existsSync.mockReturnValue(false)
    expect(await get('fs:scanMidi')({}, 'C:/gone')).toBeNull()
  })

  it('returns null (not throw) when readdir blows up', async () => {
    h.existsSync.mockReturnValue(true)
    h.readdirSync.mockImplementation(() => { throw new Error('EACCES') })
    expect(await get('fs:scanMidi')({}, 'C:/locked')).toBeNull()
  })

  it('keeps only .mid/.midi files and strips the extension from the name', async () => {
    h.existsSync.mockReturnValue(true)
    const entry = (name: string, isFile: boolean) => ({ name, isFile: () => isFile })
    h.readdirSync.mockReturnValue([
      entry('a.mid', true),
      entry('b.MIDI', true),
      entry('readme.txt', true),
      entry('subdir.mid', false), // dir whose name happens to end .mid
    ])
    const res = (await get('fs:scanMidi')({}, 'C:/m')) as { name: string; path: string }[]
    expect(res.map((r) => r.name)).toEqual(['a', 'b'])
    expect(res[0].path).toContain('a.mid')
  })

  it('returns [] (empty, not null) for a readable but song-less folder', async () => {
    h.existsSync.mockReturnValue(true)
    h.readdirSync.mockReturnValue([])
    expect(await get('fs:scanMidi')({}, 'C:/empty')).toEqual([])
  })
})

// ─── fs:readMidi ──────────────────────────────────────────────────────────────
describe('fs:readMidi', () => {
  it('returns null when the read throws', async () => {
    h.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    expect(await get('fs:readMidi')({}, 'C:/missing.mid')).toBeNull()
  })

  it('returns a sliced ArrayBuffer on success', async () => {
    const u8 = new Uint8Array([9, 8, 7])
    h.readFileSync.mockReturnValue({ buffer: u8.buffer, byteOffset: 0, byteLength: u8.byteLength })
    const buf = (await get('fs:readMidi')({}, 'C:/a.mid')) as ArrayBuffer
    expect(new Uint8Array(buf)).toEqual(u8)
  })
})

// ─── fs:watchFolder ───────────────────────────────────────────────────────────
describe('fs:watchFolder', () => {
  it('does not start a watcher for an empty path', () => {
    get('fs:watchFolder')({ sender: {} }, '')
    expect(h.watch).not.toHaveBeenCalled()
  })

  it('does not start a watcher when the folder is gone', () => {
    h.existsSync.mockReturnValue(false)
    get('fs:watchFolder')({ sender: {} }, 'C:/gone')
    expect(h.watch).not.toHaveBeenCalled()
  })

  it('starts a watcher for an existing folder', () => {
    h.existsSync.mockReturnValue(true)
    h.watch.mockReturnValue({ close: vi.fn() })
    get('fs:watchFolder')({ sender: {} }, 'C:/m')
    expect(h.watch).toHaveBeenCalledTimes(1)
    expect(h.watch.mock.calls[0][0]).toBe('C:/m')
  })

  it('debounces and only notifies for MIDI filenames', () => {
    vi.useFakeTimers()
    h.existsSync.mockReturnValue(true)
    let cb!: (evt: string, filename: string) => void
    h.watch.mockImplementation((_p: string, _o: unknown, fn: typeof cb) => { cb = fn; return { close: vi.fn() } })
    const send = vi.fn()
    const sender = { isDestroyed: () => false, send }
    get('fs:watchFolder')({ sender }, 'C:/m')

    cb('change', 'notes.txt')  // ignored — non-MIDI
    vi.advanceTimersByTime(500)
    expect(send).not.toHaveBeenCalled()

    cb('change', 'song.mid')   // relevant
    vi.advanceTimersByTime(500)
    expect(send).toHaveBeenCalledWith('fs:folderChanged', 'C:/m')
    vi.useRealTimers()
  })
})

// ─── dialog:saveBuffer / saveText ─────────────────────────────────────────────
describe('save handlers', () => {
  it('saveBuffer returns false and writes nothing on cancel', async () => {
    h.showSaveDialog.mockResolvedValue({ canceled: true })
    expect(await get('dialog:saveBuffer')({}, 'x.mid', 'mid', new ArrayBuffer(2))).toBe(false)
    expect(h.writeFileSync).not.toHaveBeenCalled()
  })

  it('saveBuffer writes the buffer and returns true', async () => {
    h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/out.mid' })
    expect(await get('dialog:saveBuffer')({}, 'x.mid', 'mid', new ArrayBuffer(4))).toBe(true)
    expect(h.writeFileSync.mock.calls[0][0]).toBe('C:/out.mid')
  })

  it('saveText writes utf-8 text and returns true', async () => {
    h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/out.xml' })
    expect(await get('dialog:saveText')({}, 'x.xml', 'musicxml', '<score/>')).toBe(true)
    expect(h.writeFileSync).toHaveBeenCalledWith('C:/out.xml', '<score/>', 'utf-8')
  })

  it('saveText returns false on cancel', async () => {
    h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: undefined })
    expect(await get('dialog:saveText')({}, 'x.xml', 'musicxml', 'data')).toBe(false)
  })
})

// ─── app:getDataPath ──────────────────────────────────────────────────────────
describe('app:getDataPath', () => {
  it('creates the samples dir when missing and returns it', () => {
    h.existsSync.mockReturnValue(false)
    const p = get('app:getDataPath')() as string
    expect(p).toContain('samples')
    expect(h.mkdirSync).toHaveBeenCalledWith(p, { recursive: true })
  })

  it('skips mkdir when the dir already exists', () => {
    h.existsSync.mockReturnValue(true)
    get('app:getDataPath')()
    expect(h.mkdirSync).not.toHaveBeenCalled()
  })
})
