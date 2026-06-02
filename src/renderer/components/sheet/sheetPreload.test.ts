import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mock OSMD: constructor records the host container; load/render are no-ops.
const osmdInstances: Array<{ container: HTMLElement }> = []
vi.mock('opensheetmusicdisplay', () => ({
  OpenSheetMusicDisplay: class {
    container: HTMLElement
    constructor(container: HTMLElement) { this.container = container; osmdInstances.push(this) }
    load = vi.fn().mockResolvedValue(undefined)
    render = vi.fn()
  },
}))

// ── Mock the XML builder so we can force the success / empty-XML branches.
let xmlReturn: string | null = '<xml/>'
vi.mock('./musicXmlBuilder', () => ({
  midiToMusicXml: vi.fn(() => xmlReturn),
}))

import {
  preloadSheet, getCachedSheet, hasCachedSheetByName, evictSheetByName,
  attachCachedTo, detachCachedToStorage, disposeSheetCache,
} from './sheetPreload'
import { midiToMusicXml } from './musicXmlBuilder'
import type { MidiFileData } from '@/types'

function file(name: string, bpm = 120): MidiFileData {
  return {
    name, bpm,
    notes: [{ midi: 60, time: 0, duration: 1, velocity: 0.8, hand: 'right' }],
    timeSignature: [4, 4],
  } as unknown as MidiFileData
}

beforeEach(() => {
  xmlReturn = '<xml/>'
  osmdInstances.length = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
})

afterEach(() => {
  disposeSheetCache()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('preloadSheet', () => {
  it('renders and caches on success', async () => {
    const ok = await preloadSheet(file('a.mid'))
    expect(ok).toBe(true)
    expect(getCachedSheet('a.mid', 120)).not.toBeNull()
  })

  it('returns true immediately when already cached (idempotent)', async () => {
    await preloadSheet(file('a.mid'))
    ;(midiToMusicXml as ReturnType<typeof vi.fn>).mockClear()
    const ok = await preloadSheet(file('a.mid'))
    expect(ok).toBe(true)
    expect(midiToMusicXml).not.toHaveBeenCalled() // short-circuited, no re-render
  })

  it('deduplicates concurrent preloads of the same file', async () => {
    const p1 = preloadSheet(file('b.mid'))
    const p2 = preloadSheet(file('b.mid'))
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(midiToMusicXml).toHaveBeenCalledTimes(1) // one in-flight render
  })

  it('returns false and removes the container when XML build yields null', async () => {
    xmlReturn = null
    const before = document.body.childElementCount
    const ok = await preloadSheet(file('c.mid'))
    expect(ok).toBe(false)
    expect(getCachedSheet('c.mid', 120)).toBeNull()
    expect(document.body.childElementCount).toBe(before)
  })

  it('returns false and cleans up when load throws (catch branch)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Force the next OSMD instance's load to reject by overriding after ctor.
    const orig = window.requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => { throw new Error('boom') })
    const ok = await preloadSheet(file('d.mid'))
    expect(ok).toBe(false)
    expect(getCachedSheet('d.mid', 120)).toBeNull()
    vi.stubGlobal('requestAnimationFrame', orig)
  })
})

describe('hasCachedSheetByName', () => {
  it('true for a cached name (any bpm), false otherwise', async () => {
    await preloadSheet(file('song.mid', 90))
    expect(hasCachedSheetByName('song.mid')).toBe(true)
    expect(hasCachedSheetByName('nope.mid')).toBe(false)
  })
})

describe('getCachedSheet LRU', () => {
  it('returns null on miss', () => {
    expect(getCachedSheet('x', 1)).toBeNull()
  })

  it('re-inserts on hit (LRU touch)', async () => {
    await preloadSheet(file('one.mid'))
    await preloadSheet(file('two.mid'))
    // Touch 'one' so it becomes most-recent.
    expect(getCachedSheet('one.mid', 120)).not.toBeNull()
  })

  it('evicts the oldest detached entry past MAX_CACHE (10)', async () => {
    for (let i = 0; i < 11; i++) await preloadSheet(file(`lru-${i}.mid`))
    // 11th insert triggers eviction of the oldest body-attached container.
    expect(getCachedSheet('lru-0.mid', 120)).toBeNull()
    expect(getCachedSheet('lru-10.mid', 120)).not.toBeNull()
  })
})

describe('evictSheetByName', () => {
  it('drops all entries for a name and removes their containers', async () => {
    await preloadSheet(file('e.mid', 100))
    await preloadSheet(file('e.mid', 200)) // same name, two bpms
    evictSheetByName('e.mid')
    expect(getCachedSheet('e.mid', 100)).toBeNull()
    expect(getCachedSheet('e.mid', 200)).toBeNull()
  })

  it('leaves other names untouched', async () => {
    await preloadSheet(file('keep.mid'))
    await preloadSheet(file('drop.mid'))
    evictSheetByName('drop.mid')
    expect(getCachedSheet('keep.mid', 120)).not.toBeNull()
  })
})

describe('attach / detach', () => {
  it('attachCachedTo moves the container into a wrapper and clears off-screen styles', async () => {
    await preloadSheet(file('f.mid'))
    const wrapper = document.createElement('div')
    const entry = attachCachedTo('f.mid', 120, wrapper)
    expect(entry).not.toBeNull()
    expect(entry!.container.parentElement).toBe(wrapper)
    expect(entry!.container.style.position).toBe('relative')
    expect(entry!.container.style.left).toBe('')
  })

  it('attachCachedTo returns null when nothing is cached', () => {
    const wrapper = document.createElement('div')
    expect(attachCachedTo('ghost.mid', 1, wrapper)).toBeNull()
  })

  it('detachCachedToStorage moves the container back to body off-screen', async () => {
    await preloadSheet(file('g.mid'))
    const wrapper = document.createElement('div')
    attachCachedTo('g.mid', 120, wrapper)
    detachCachedToStorage('g.mid', 120)
    const entry = getCachedSheet('g.mid', 120)!
    expect(entry.container.parentElement).toBe(document.body)
    expect(entry.container.style.position).toBe('fixed')
  })

  it('detachCachedToStorage is a no-op for an uncached file', () => {
    expect(() => detachCachedToStorage('ghost.mid', 1)).not.toThrow()
  })
})

describe('disposeSheetCache', () => {
  it('removes all containers and clears the cache', async () => {
    await preloadSheet(file('h.mid'))
    disposeSheetCache()
    expect(getCachedSheet('h.mid', 120)).toBeNull()
    expect(hasCachedSheetByName('h.mid')).toBe(false)
  })
})
