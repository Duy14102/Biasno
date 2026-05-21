// ─── Sheet music pre-loader (multi-slot LRU cache) ──────────────────────────
//
// OSMD's render() is a synchronous, ~1–2 s main-thread block on long songs.
// To avoid freezing the UI the moment the user toggles the sheet inside the
// practice page, we pre-render the sheet into a detached, off-screen
// container the moment the user picks / drops / scans a MIDI file.  Multiple
// sheets coexist in memory (an LRU map) so EVERY file the user added is
// click-instant on the practice page — not just the most recent one.
//
// The sheet is rendered with BOTH hands.  Mode (left/right/both) only affects
// the interactive parts (falling notes & key feedback); the sheet always
// shows the full piece.

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { MidiFileData } from '@/components'
import { midiToMusicXml } from './musicXmlBuilder'

// Extra per-render data the SheetMusic component fills in on first attach.
// Cached alongside the OSMD instance so subsequent attaches don't re-walk
// the tree or reset the cursor from step 0.
export interface SheetExtras {
  noteRefs:    unknown[]   // typed in SheetMusic.tsx; opaque here
  steps:       number[]
  lastStepIdx: number
}

export interface CachedSheet {
  midiName:  string
  bpm:       number
  container: HTMLDivElement
  osmd:      OpenSheetMusicDisplay
  extras:    SheetExtras | null
}

// Hard cap on how many sheets we keep rendered at once.  Each adds a full
// SVG subtree to document.body, so we don't want this unbounded.  10 covers
// a typical practice library while staying well under any reasonable memory
// budget.  Insertion order is the LRU order; `getCachedSheet` re-inserts on
// hit to keep "recently used" at the tail.
const MAX_CACHE = 10
const cache = new Map<string, CachedSheet>()
// Dedupe concurrent preloads of the same file (e.g. folder scan kicks one
// off, then the user clicks the same row before it finishes).  Mapping
// from key → in-flight promise.
const inFlight = new Map<string, Promise<boolean>>()

function keyOf(midiName: string, bpm: number): string {
  return `${midiName}|${bpm}`
}

/** True if ANY cached sheet matches this midiName (any bpm). */
export function hasCachedSheetByName(midiName: string): boolean {
  for (const entry of cache.values()) {
    if (entry.midiName === midiName) return true
  }
  return false
}

/** Drop every cached sheet for this midiName.  Used when the user deletes a
 *  file from the library so its rendered SVG doesn't leak in memory. */
export function evictSheetByName(midiName: string): void {
  for (const [key, entry] of cache) {
    if (entry.midiName !== midiName) continue
    entry.container.remove()
    cache.delete(key)
  }
}

/** Returns the cached sheet for (name, bpm) and bumps its LRU position. */
export function getCachedSheet(midiName: string, bpm: number): CachedSheet | null {
  const k = keyOf(midiName, bpm)
  const entry = cache.get(k)
  if (!entry) return null
  // LRU touch — re-insert moves to the tail.
  cache.delete(k)
  cache.set(k, entry)
  return entry
}

async function doPreload(midiFile: MidiFileData, k: string): Promise<boolean> {
  // Hidden off-screen host so the SVG lays out at real practice-page width.
  const container = document.createElement('div')
  container.style.position  = 'fixed'
  container.style.left      = '-99999px'
  container.style.top       = '0'
  container.style.width     = window.innerWidth + 'px'
  container.style.minHeight = '100%'
  container.setAttribute('data-osmd-preload', '')
  document.body.appendChild(container)

  try {
    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false,
      drawingParameters: 'compact',
      drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false,
      cursorsOptions: [{ type: 0, color: '#3b82f6', alpha: 0.15, follow: false }],
    })

    const xml = midiToMusicXml(midiFile.notes, midiFile.bpm, midiFile.timeSignature, ['left', 'right'])
    if (!xml) { container.remove(); return false }

    await osmd.load(xml)
    // Yield one frame so any UI updates around us can paint between the
    // (sync) load step and the (sync) render step.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    osmd.render()

    cache.set(k, { midiName: midiFile.name, bpm: midiFile.bpm, container, osmd, extras: null })

    // LRU evict.  Walk in insertion order (oldest first) and remove the first
    // entry that is NOT currently attached to a SheetMusic wrapper.  An
    // attached container's parent is the wrapper div; detached containers
    // live under <body>.  We never evict an attached entry because that
    // would yank the SVG out from under the visible sheet.
    if (cache.size > MAX_CACHE) {
      for (const [evictKey, entry] of cache) {
        if (cache.size <= MAX_CACHE) break
        if (evictKey === k) continue   // never evict the one we just added
        if (entry.container.parentElement === document.body) {
          entry.container.remove()
          cache.delete(evictKey)
        }
      }
    }

    return true
  } catch (e) {
    console.error('[sheetPreload]', e)
    container.remove()
    return false
  }
}

/**
 * Pre-render the sheet for the given MIDI file.  Idempotent on already-cached
 * files; deduplicates concurrent calls for the same file.  Returns true on
 * success.
 */
export async function preloadSheet(midiFile: MidiFileData): Promise<boolean> {
  const k = keyOf(midiFile.name, midiFile.bpm)
  if (cache.has(k)) return true
  const existing = inFlight.get(k)
  if (existing) return existing
  const p = doPreload(midiFile, k).finally(() => inFlight.delete(k))
  inFlight.set(k, p)
  return p
}

/**
 * Move the cached container for (midiName, bpm) into a visible wrapper.
 * Returns the cache entry, or null if there's nothing cached for that file.
 */
export function attachCachedTo(midiName: string, bpm: number, wrapper: HTMLElement): CachedSheet | null {
  const entry = getCachedSheet(midiName, bpm)
  if (!entry) return null
  entry.container.style.position = 'relative'
  entry.container.style.left     = ''
  entry.container.style.top      = ''
  entry.container.style.width    = ''     // let parent control width
  wrapper.appendChild(entry.container)
  return entry
}

/**
 * Move the cached container for (midiName, bpm) back to body (off-screen) so
 * it survives the caller's React unmount.  Cache entry stays — it's just
 * detached from the visible DOM.  No-op if the file isn't cached.
 */
export function detachCachedToStorage(midiName: string, bpm: number): void {
  const entry = cache.get(keyOf(midiName, bpm))
  if (!entry) return
  entry.container.style.position  = 'fixed'
  entry.container.style.left      = '-99999px'
  entry.container.style.top       = '0'
  entry.container.style.width     = window.innerWidth + 'px'
  document.body.appendChild(entry.container)
}

/** Throw away every cached sheet.  Used when resetting the whole library. */
export function disposeSheetCache(): void {
  for (const entry of cache.values()) entry.container.remove()
  cache.clear()
  inFlight.clear()
}
