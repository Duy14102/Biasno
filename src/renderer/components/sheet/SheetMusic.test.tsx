import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import React from 'react'

// ── OSMD cursor/instance stub ────────────────────────────────────────────────
function makeOsmd() {
  const it = {
    EndReached: true,
    currentTimeStamp: { RealValue: 0 },
    moveToNext: vi.fn(),
  }
  return {
    cursor: {
      reset: vi.fn(),
      show: vi.fn(),
      next: vi.fn(),
      update: vi.fn(),
      Iterator: it,
    },
    render: vi.fn(),
  }
}

let cached: ReturnType<typeof makeEntry> | null
function makeEntry() {
  const container = document.createElement('div')
  return { midiName: 'x', bpm: 120, container, osmd: makeOsmd(), extras: null as null | { noteRefs: unknown[]; steps: number[]; lastStepIdx: number } }
}

const H = vi.hoisted(() => ({
  getCachedSheet: vi.fn(),
  attachCachedTo: vi.fn(),
  detachCachedToStorage: vi.fn(),
  preloadSheet: vi.fn(),
  collectNoteRefs: vi.fn(),
  bsearchStep: vi.fn(),
  lowerBoundRefs: vi.fn(),
  clearHighlights: vi.fn(),
  colorFullNote: vi.fn(),
  resetScrollState: vi.fn(),
  scrollToCursor: vi.fn(),
}))
const {
  getCachedSheet, attachCachedTo, detachCachedToStorage, preloadSheet,
  collectNoteRefs, bsearchStep, lowerBoundRefs,
  clearHighlights, colorFullNote, scrollToCursor,
} = H

vi.mock('./sheetPreload', () => ({
  getCachedSheet: H.getCachedSheet,
  attachCachedTo: H.attachCachedTo,
  detachCachedToStorage: H.detachCachedToStorage,
  preloadSheet: H.preloadSheet,
}))
vi.mock('./noteRefs', () => ({
  collectNoteRefs: H.collectNoteRefs,
  bsearchStep: H.bsearchStep,
  lowerBoundRefs: H.lowerBoundRefs,
}))
vi.mock('./highlighting', () => ({ clearHighlights: H.clearHighlights, colorFullNote: H.colorFullNote }))
vi.mock('./scrollToCursor', () => ({ resetScrollState: H.resetScrollState, scrollToCursor: H.scrollToCursor }))
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))

import SheetMusic from './SheetMusic'
import type { MidiFileData, Hand } from '@/types'

const midiFile = { name: 'song.mid', bpm: 120, notes: [], timeSignature: [4, 4] } as unknown as MidiFileData

function setup(over: { highlightMode?: boolean; activeKeys?: Map<number, { hand: Hand }> } = {}) {
  const currentTimeRef = { current: 0 }
  const activeKeys = over.activeKeys ?? new Map()
  const utils = render(
    <SheetMusic
      midiFile={midiFile}
      currentTimeRef={currentTimeRef}
      activeKeys={activeKeys}
      highlightMode={over.highlightMode}
    />,
  )
  return { currentTimeRef, ...utils }
}

beforeEach(() => {
  cached = makeEntry()
  vi.clearAllMocks()
  getCachedSheet.mockReturnValue(cached as unknown)
  attachCachedTo.mockImplementation((_n: string, _b: number, wrapper: HTMLElement) => {
    if (!cached) return null
    wrapper.appendChild(cached.container)
    return cached
  })
  detachCachedToStorage.mockReturnValue(undefined)
  collectNoteRefs.mockReturnValue([])
  bsearchStep.mockReturnValue(0)
  lowerBoundRefs.mockReturnValue(0)
  preloadSheet.mockResolvedValue(true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', () => 1) // park the cursor-sync RAF
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('SheetMusic load path', () => {
  it('starts NOT loading when a cached sheet exists, and attaches it (fast path)', () => {
    setup()
    expect(attachCachedTo).toHaveBeenCalled()
    expect(collectNoteRefs).toHaveBeenCalled() // first attach, no extras → walk
    expect(scrollToCursor).toHaveBeenCalled()
  })

  it('reuses extras on re-attach instead of re-walking', () => {
    cached!.extras = { noteRefs: [], steps: [0, 1, 2], lastStepIdx: 1 }
    setup()
    expect(collectNoteRefs).not.toHaveBeenCalled() // extras present → reuse
  })

  it('takes the slow preload path when nothing is cached', async () => {
    getCachedSheet.mockReturnValueOnce(null) // isLoading init
    getCachedSheet.mockReturnValueOnce(null) // effect: not cached → preload
    const c = makeEntry()
    // After preload, initFromCache calls getCachedSheet via attachCachedTo (which uses `cached`).
    cached = c
    await act(async () => { setup() })
    expect(preloadSheet).toHaveBeenCalled()
  })

  it('handles a failed preload (ok=false) without attaching', async () => {
    getCachedSheet.mockReturnValue(null)
    preloadSheet.mockResolvedValueOnce(false)
    await act(async () => { setup() })
    expect(attachCachedTo).not.toHaveBeenCalled()
  })

  it('handles a rejected preload (catch branch)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getCachedSheet.mockReturnValue(null)
    preloadSheet.mockRejectedValueOnce(new Error('boom'))
    await act(async () => { setup() })
    expect(console.error).toHaveBeenCalled()
  })

  it('clears highlights and detaches on unmount', () => {
    const { unmount } = setup()
    clearHighlights.mockClear()
    unmount()
    expect(clearHighlights).toHaveBeenCalled()
    expect(detachCachedToStorage).toHaveBeenCalled()
  })
})

describe('SheetMusic toggles', () => {
  it('toggles the auto-scroll lock button', () => {
    const { getByTitle } = setup()
    // starts ON → title autoScrollOnHint
    fireEvent.click(getByTitle('autoScrollOnHint'))
    expect(getByTitle('autoScrollOffHint')).toBeTruthy()
  })

  it('toggles the dark-sheet button', () => {
    const { getByTitle, container } = setup()
    fireEvent.click(getByTitle('lightSheetHint'))
    expect(getByTitle('darkSheetHint')).toBeTruthy()
    const host = container.querySelector('[data-osmd-host]') as HTMLElement
    expect(host.getAttribute('data-dark')).toBe('true')
  })
})

describe('SheetMusic highlighting effect', () => {
  it('does not colour notes when highlightMode is off', () => {
    setup({ highlightMode: false })
    expect(colorFullNote).not.toHaveBeenCalled()
  })

  it('colours active notes when highlightMode is on with matching refs', () => {
    const refs = [{ svgId: 'n1', isRight: true, isBlack: false, timeInSeconds: 0 }]
    collectNoteRefs.mockReturnValue(refs as unknown[])
    lowerBoundRefs.mockReturnValue(0)
    const { rerender, currentTimeRef } = (() => {
      const ctr = { current: 0 }
      const u = render(
        <SheetMusic midiFile={midiFile} currentTimeRef={ctr} activeKeys={new Map()} highlightMode />,
      )
      return { ...u, currentTimeRef: ctr }
    })()
    // Re-render with a new activeKeys identity to re-run the highlight effect.
    rerender(
      <SheetMusic midiFile={midiFile} currentTimeRef={currentTimeRef} activeKeys={new Map([[60, { hand: 'right' as Hand }]])} highlightMode />,
    )
    expect(colorFullNote).toHaveBeenCalledWith('n1', true, false, expect.anything())
  })
})
