import { describe, it, expect, vi, beforeEach } from 'vitest'

const { exposeInMainWorld, invoke, on, removeListener, getPathForFile } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn((..._a: unknown[]) => {}),
  invoke: vi.fn((..._a: unknown[]) => Promise.resolve('ok')),
  on: vi.fn((..._a: unknown[]) => {}),
  removeListener: vi.fn((..._a: unknown[]) => {}),
  getPathForFile: vi.fn((..._a: unknown[]) => 'C:/abs/path.mid'),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (...a: unknown[]) => exposeInMainWorld(...a) },
  ipcRenderer: {
    invoke: (...a: unknown[]) => invoke(...a),
    on: (...a: unknown[]) => on(...a),
    removeListener: (...a: unknown[]) => removeListener(...a),
  },
  webUtils: { getPathForFile: (...a: unknown[]) => getPathForFile(...a) },
}))

// Import once — exposeInMainWorld runs at module load.
import './index'

type Api = Record<string, (...args: unknown[]) => unknown>
const api = exposeInMainWorld.mock.calls[0][1] as Api

beforeEach(() => {
  invoke.mockClear()
  on.mockClear()
  removeListener.mockClear()
  getPathForFile.mockClear()
})

describe('preload contextBridge wiring', () => {
  it('exposes electronAPI with the full method surface', () => {
    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(exposeInMainWorld.mock.calls[0][0]).toBe('electronAPI')
    expect(Object.keys(api).sort()).toEqual(
      [
        'getDataPath', 'getPathForFile', 'onFolderChanged', 'openFolder',
        'openMidiFile', 'readMidiFile', 'saveBuffer', 'savePdfFromHtml',
        'saveText', 'scanMidiFolder', 'unwatchFolder', 'watchFolder',
      ].sort(),
    )
  })
})

describe('invoke-forwarding methods route to the right channel', () => {
  it.each([
    ['openMidiFile', [], 'dialog:openMidi', []],
    ['openFolder', [], 'dialog:openFolder', []],
    ['scanMidiFolder', ['C:/m'], 'fs:scanMidi', ['C:/m']],
    ['readMidiFile', ['C:/a.mid'], 'fs:readMidi', ['C:/a.mid']],
    ['getDataPath', [], 'app:getDataPath', []],
    ['watchFolder', ['C:/w'], 'fs:watchFolder', ['C:/w']],
    ['unwatchFolder', [], 'fs:unwatchFolder', []],
  ] as const)('%s → %s', (method, args, channel, fwd) => {
    ;(api[method] as (...a: unknown[]) => unknown)(...args)
    expect(invoke).toHaveBeenCalledWith(channel, ...fwd)
  })

  it('saveBuffer forwards defaultName, kind and buffer', () => {
    const buf = new ArrayBuffer(8)
    api.saveBuffer('out.mid', 'mid', buf)
    expect(invoke).toHaveBeenCalledWith('dialog:saveBuffer', 'out.mid', 'mid', buf)
  })

  it('saveText forwards defaultName, kind and text', () => {
    api.saveText('out.xml', 'musicxml', '<score/>')
    expect(invoke).toHaveBeenCalledWith('dialog:saveText', 'out.xml', 'musicxml', '<score/>')
  })

  it('savePdfFromHtml forwards defaultName and html', () => {
    api.savePdfFromHtml('out.pdf', '<html/>')
    expect(invoke).toHaveBeenCalledWith('dialog:savePdfFromHtml', 'out.pdf', '<html/>')
  })

  it('invoke methods return the underlying promise', async () => {
    await expect(api.getDataPath()).resolves.toBe('ok')
  })
})

describe('getPathForFile (synchronous webUtils bridge)', () => {
  it('delegates to webUtils.getPathForFile and returns its value', () => {
    const file = {} as File
    const result = api.getPathForFile(file)
    expect(getPathForFile).toHaveBeenCalledWith(file)
    expect(result).toBe('C:/abs/path.mid')
  })
})

describe('onFolderChanged subscription', () => {
  it('registers a listener on the fs:folderChanged channel', () => {
    api.onFolderChanged(vi.fn())
    expect(on).toHaveBeenCalledTimes(1)
    expect(on.mock.calls[0][0]).toBe('fs:folderChanged')
  })

  it('forwarded handler strips the event arg and passes only the path', () => {
    const cb = vi.fn()
    api.onFolderChanged(cb)
    const registered = on.mock.calls[0][1] as (e: unknown, p: string) => void
    registered({ sender: 1 }, 'C:/changed')
    expect(cb).toHaveBeenCalledWith('C:/changed')
  })

  it('returns an unsubscribe that removes the same handler', () => {
    const off = api.onFolderChanged(vi.fn()) as () => void
    const registered = on.mock.calls[0][1]
    off()
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener.mock.calls[0][0]).toBe('fs:folderChanged')
    expect(removeListener.mock.calls[0][1]).toBe(registered)
  })
})
