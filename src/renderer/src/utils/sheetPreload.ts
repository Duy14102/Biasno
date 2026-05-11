// ─── Sheet music pre-loader ──────────────────────────────────────────────────
//
// OSMD's render() is a synchronous, ~1–2 s main-thread block on long songs.
// To avoid freezing the UI (and stuttering already-playing audio) the moment
// the user toggles the sheet inside the practice page, we pre-render the
// sheet ONCE on the home page right after the user picks a MIDI file — while
// they're already waiting for navigation anyway.
//
// The render is done into a detached, off-screen container that lives in
// document.body.  When the SheetMusic component later mounts, it pulls the
// cached container straight into its scroll wrapper — no re-render needed.
//
// The sheet is rendered with BOTH hands.  Mode (left/right/both) only affects
// the interactive parts (falling notes & key feedback); the sheet always
// shows the full piece so the player keeps musical context.

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { MidiFileData } from '../types'
import { midiToMusicXml } from './musicXmlBuilder'

// Extra per-render data the SheetMusic component fills in on first attach,
// so that subsequent toggles (off → on) don't need to re-walk the OSMD tree.
//   • noteRefs / steps: O(N) tree walks — cached forever per OSMD instance.
//   • lastStepIdx:      the cursor's current step index.  OSMD keeps the
//                       cursor's DOM position across detach/attach, so we can
//                       skip the cursor.reset() + cursor.next() loop that
//                       would otherwise re-advance from 0 on every remount.
export interface SheetExtras {
  noteRefs:    unknown[]   // typed in SheetMusic.tsx; opaque here
  steps:       number[]
  lastStepIdx: number
}

interface CachedSheet {
  midiName:  string
  bpm:       number
  container: HTMLDivElement
  osmd:      OpenSheetMusicDisplay
  extras:    SheetExtras | null
}

let cache: CachedSheet | null = null
// Monotonic request id used to ignore the result of a stale preload that
// was superseded by a newer file-pick before it finished rendering.
let activeReqId = 0

/** Returns the cached sheet if the (name, bpm) match, else null. */
export function getCachedSheet(midiName: string, bpm: number): CachedSheet | null {
  if (cache && cache.midiName === midiName && cache.bpm === bpm) return cache
  return null
}

/**
 * Pre-render the sheet for the given MIDI file into a detached off-screen
 * container.  Safe to call multiple times — same (name, bpm) is a no-op.
 * Returns true on success.
 */
export async function preloadSheet(midiFile: MidiFileData): Promise<boolean> {
  if (cache && cache.midiName === midiFile.name && cache.bpm === midiFile.bpm) return true

  const reqId = ++activeReqId

  // Drop previous cache (different file or stale)
  if (cache) {
    cache.container.remove()
    cache = null
  }

  // Hidden off-screen host so the SVG is laid out at real practice-page width
  // (innerWidth ≈ practice page width since it's full-screen).
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
    if (reqId !== activeReqId) { container.remove(); return false }

    // Yield one frame so any UI updates (spinner, etc.) can paint before the
    // synchronous render() block hits.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    if (reqId !== activeReqId) { container.remove(); return false }

    osmd.render()
    if (reqId !== activeReqId) { container.remove(); return false }

    cache = { midiName: midiFile.name, bpm: midiFile.bpm, container, osmd, extras: null }
    return true
  } catch (e) {
    console.error('[sheetPreload]', e)
    container.remove()
    return false
  }
}

/**
 * Move the cached container into a visible wrapper.  Returns the container
 * so the caller can read/inspect it; returns null if no cache exists.
 *
 * The container's positioning is reset so it flows naturally inside `wrapper`.
 */
export function attachCachedTo(wrapper: HTMLElement): CachedSheet | null {
  if (!cache) return null
  cache.container.style.position = 'relative'
  cache.container.style.left     = ''
  cache.container.style.top      = ''
  cache.container.style.width    = ''      // let parent control width
  wrapper.appendChild(cache.container)
  return cache
}

/**
 * Move the cached container back to body (off-screen) so it survives the
 * caller's React unmount.  No-op if cache is empty or container was already
 * relocated externally.
 */
export function detachCachedToStorage(): void {
  if (!cache) return
  cache.container.style.position  = 'fixed'
  cache.container.style.left      = '-99999px'
  cache.container.style.top       = '0'
  cache.container.style.width     = window.innerWidth + 'px'
  document.body.appendChild(cache.container)
}

/** Throw away any cached sheet.  Call when the file selection is reset. */
export function disposeSheetCache(): void {
  if (cache) {
    cache.container.remove()
    cache = null
  }
  activeReqId++   // invalidate any in-flight preload
}
