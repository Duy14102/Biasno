import React, { useRef, useEffect, useState, useCallback } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { MidiFileData, Hand } from '../types'
import {
  getCachedSheet, preloadSheet, attachCachedTo, detachCachedToStorage
} from '../utils/sheetPreload'

// ─── Binary search helpers ────────────────────────────────────────────────────
function bsearchStep(steps: number[], t: number): number {
  if (!steps.length) return 0
  let lo = 0, hi = steps.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (steps[mid] <= t) lo = mid; else hi = mid - 1 }
  return lo
}
// First index i where refs[i].timeInSeconds >= target
function lowerBoundRefs(refs: NoteRef[], target: number): number {
  let lo = 0, hi = refs.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (refs[mid].timeInSeconds < target) lo = mid + 1; else hi = mid }
  return lo
}

// ─── Per-note timing + VexFlow id + hand info ────────────────────────────────
// isRight = treble staff (staff index 0 in OSMD's MeasureList row)
// isBlack = note requires a black piano key (sharp/flat)
interface NoteRef {
  timeInSeconds: number
  durSeconds:    number
  svgId:         string
  isRight:       boolean   // treble = right hand
  isBlack:       boolean   // black key (sharp or flat)
  midi:          number    // MIDI note number (OSMD halfTone + 12)
}

// Black key pitch classes: C#=1, D#=3, F#=6, G#=8, A#=10
const BLACK_PCS = new Set([1, 3, 6, 8, 10])

function collectNoteRefs(osmd: OpenSheetMusicDisplay, bpm: number): NoteRef[] {
  const bpm_  = Math.max(1, bpm)
  const refs: NoteRef[] = []
  const seen  = new Set<string>()
  try {
    for (const row of osmd.GraphicSheet.MeasureList) {
      for (let staffIdx = 0; staffIdx < row.length; staffIdx++) {
        const measure = row[staffIdx]
        if (!measure) continue
        const isRight = (staffIdx === 0)   // treble = staff 0 = right hand
        const mWN = (measure as any).parentSourceMeasure?.AbsoluteTimestamp?.RealValue ?? 0

        for (const entry of (measure as any).staffEntries ?? []) {
          const eWN = entry.relInMeasureTimestamp?.RealValue ?? 0
          const timeInSeconds = (mWN + eWN) * 4 * 60 / bpm_

          for (const gve of entry.graphicalVoiceEntries ?? []) {
            for (const gnote of gve.notes ?? []) {
              if (gnote.sourceNote?.Pitch == null) continue
              try {
                const svgId = (gnote as any).getSVGId?.() as string | null | undefined
                if (!svgId || seen.has(svgId)) continue
                seen.add(svgId)

                // Determine black/white key from accidentals + fundamental note.
                // halfTone % 12 gives pitch class (0=C … 11=B).
                const halfTone: number = (gnote.sourceNote?.Pitch?.halfTone ?? 0)
                const isBlack = BLACK_PCS.has(((halfTone % 12) + 12) % 12)
                // OSMD halfTone: C0=0; MIDI: C-1=0 → offset is +12
                const midi = halfTone + 12

                const durWN = gnote.sourceNote?.Length?.RealValue ?? 0.25
                refs.push({
                  timeInSeconds,
                  durSeconds: Math.max(0.05, durWN * 4 * 60 / bpm_),
                  svgId,
                  isRight,
                  isBlack,
                  midi,
                })
              } catch { /* ignore */ }
            }
          }
        }
      }
    }
  } catch (e) { console.warn('[SheetMusic] collectNoteRefs:', e) }
  // Sort by time for binary search. OSMD processes staff-0 then staff-1 per row,
  // so same-beat notes from both staves arrive interleaved — sort fixes this.
  refs.sort((a, b) => a.timeInSeconds - b.timeInSeconds)
  console.log('[SheetMusic] collected', refs.length, 'note refs')
  return refs
}

// ─── Highlight color ──────────────────────────────────────────────────────────
// No CSS transition — highlights appear instantly so they match the audio timing.
// Transitions were removed because animating fill on 60 fps caused frame drops.

// 4-colour highlight scheme — mirrors FallingNotes & PianoKeyboard palette.
// Treble staff (right hand): blue shades.  Bass staff (left hand): orange shades.
const HL_COLORS = {
  rightWhite: { fill: '#4A9EFF', stroke: '#1A6ECC' },
  rightBlack: { fill: '#1A6ECC', stroke: '#0D4A99' },
  leftWhite:  { fill: '#FF8833', stroke: '#CC4411' },
  leftBlack:  { fill: '#CC4411', stroke: '#992200' },
}

function applyColor(el: HTMLElement, isRight: boolean, isBlack: boolean, out: HTMLElement[]) {
  const c = isRight
    ? (isBlack ? HL_COLORS.rightBlack : HL_COLORS.rightWhite)
    : (isBlack ? HL_COLORS.leftBlack  : HL_COLORS.leftWhite)
  el.style.fill   = c.fill
  el.style.stroke = c.stroke
  out.push(el)
}
function clearHighlights(refs: HTMLElement[]) {
  // Removing inline fill/stroke lets the SVG attribute colour show through.
  // The CSS transition defined above animates the change smoothly.
  for (const el of refs) { el.style.fill = ''; el.style.stroke = '' }
  refs.length = 0
}

// Colour the full note: notehead + stem (both inside the stavenote group for
// non-beamed notes, and via separate vf-{id}-stem element for beamed notes) +
// ledger lines.
function colorFullNote(svgId: string, isRight: boolean, isBlack: boolean, out: HTMLElement[]) {
  const apply = (el: HTMLElement) => applyColor(el, isRight, isBlack, out)

  // Main stavenote group (note heads, flag, accidentals, stem for non-beamed)
  const group = document.getElementById('vf-' + svgId)
  if (group) group.querySelectorAll<HTMLElement>('path').forEach(apply)

  // Separate stem element (beamed notes have the stem drawn by the Beam class)
  const stem = document.getElementById('vf-' + svgId + '-stem')
  if (stem) stem.querySelectorAll<HTMLElement>('path').forEach(apply)

  // Ledger lines (above/below staff for extreme pitches)
  const ledger = document.getElementById('vf-' + svgId + 'ledgers')
  if (ledger) ledger.querySelectorAll<HTMLElement>('path').forEach(apply)
}

// ─── Auto-scroll helper ───────────────────────────────────────────────────────
// Design goals:
//   1. SMOOTH  – use a custom rAF animation (ease-out, 550 ms) instead of the
//      browser's scrollTo({behavior:'smooth'}) which is ~300 ms and can be
//      cancelled/restarted every step, causing jitter.
//   2. NO CASCADE – guard with _lastTargetTop: only start a new animation when
//      the target changes by > ROW_THRESHOLD px (i.e. cursor moved to a new row).
//      Within a row the target is constant → guard fires → animation runs uninterrupted.
//   3. LOOK-AHEAD – position the cursor row at 25 % from the top so ~75 % of the
//      viewport shows the current row + the next row, giving the player advance notice.
//      Formula: targetTop = contentY - clientHeight * 0.25
//      (contentY = cursor top in content coords, independent of current scrollTop)

const ROW_THRESHOLD = 50                 // px — smaller than any row height
let _lastTargetTop  = -9999             // sentinel so first call always fires
let _rafId: number | null = null        // current animation frame id

function resetScrollState() {
  _lastTargetTop = -9999
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null }
}

function scrollToCursor(scrollEl: HTMLDivElement | null, force = false) {
  if (!scrollEl) return
  const cursorEl = document.getElementById('cursorImg-0')
  if (!cursorEl) return

  const cursorRect = cursorEl.getBoundingClientRect()
  const scrollRect = scrollEl.getBoundingClientRect()

  // Stable content-relative Y: unaffected by current scrollTop or animation state.
  // Proof: if scrollTop ↑ by Δ then cursorRect.top ↓ by Δ → sum stays constant.
  const contentY  = (cursorRect.top - scrollRect.top) + scrollEl.scrollTop

  // Place the cursor row's TOP at 25 % from the viewport top.
  // This leaves ~75 % below for the current row + the next row (look-ahead).
  // No dependency on cursor height → immune to img-not-yet-loaded issues.
  const targetTop = Math.max(0, contentY - scrollEl.clientHeight * 0.25)

  // Skip if we are already targeting the same row.
  if (!force && Math.abs(targetTop - _lastTargetTop) < ROW_THRESHOLD) return
  _lastTargetTop = targetTop

  // Cancel any in-progress animation, then start a fresh one.
  if (_rafId !== null) cancelAnimationFrame(_rafId)

  const startTop  = scrollEl.scrollTop
  const dist      = targetTop - startTop
  if (Math.abs(dist) < 1) return           // already there

  const DURATION  = 550                    // ms — long enough to feel smooth
  const t0        = performance.now()

  function animate(now: number) {
    const progress = Math.min((now - t0) / DURATION, 1)
    const eased    = 1 - Math.pow(1 - progress, 3)   // ease-out cubic
    scrollEl.scrollTop = startTop + dist * eased
    if (progress < 1) {
      _rafId = requestAnimationFrame(animate)
    } else {
      _rafId = null
    }
  }

  _rafId = requestAnimationFrame(animate)
}

// ─── Lock icon SVGs ────────────────────────────────────────────────────────────
function LockClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  )
}
function LockOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 1C9.24 1 7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 13c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
    </svg>
  )
}
// Sun / moon icons for the dark-mode toggle.  Both 24×24 viewBox so they can
// be cross-faded in the same container without size jumps during animation.
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM4.22 5.64a1 1 0 011.42 0l1.41 1.41a1 1 0 11-1.41 1.42L4.22 7.05a1 1 0 010-1.41zm12.73 12.72a1 1 0 011.41 0l1.42 1.41a1 1 0 11-1.42 1.42l-1.41-1.42a1 1 0 010-1.41zM2 12a1 1 0 011-1h2a1 1 0 110 2H3a1 1 0 01-1-1zm17 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zM5.64 19.78a1 1 0 010-1.42l1.41-1.41a1 1 0 011.42 1.41l-1.42 1.42a1 1 0 01-1.41 0zm12.72-12.73a1 1 0 010-1.41l1.41-1.42a1 1 0 011.42 1.42l-1.42 1.41a1 1 0 01-1.41 0z"/>
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
interface SheetMusicProps {
  midiFile:       MidiFileData
  // Mutable ref instead of a plain number — currentTime is updated 60 × per
  // second by the parent's RAF; receiving it as a prop would re-render this
  // component every frame, run the cursor-sync effect every frame, and drop
  // frames during playback (perceived as audio stutter).  Passing a stable
  // ref lets us read the value in an internal RAF loop without re-rendering.
  currentTimeRef: React.MutableRefObject<number>
  activeKeys:     Map<number, { hand: Hand; hitState?: string; time?: number }>
  highlightMode?: boolean
}

function SheetMusic({
  midiFile, currentTimeRef, activeKeys, highlightMode = false
}: SheetMusicProps): React.JSX.Element {
  const bpm            = midiFile.bpm
  const scrollRef      = useRef<HTMLDivElement>(null)   // the overflow-y-auto scroll wrapper
  const wrapperRef     = useRef<HTMLDivElement>(null)   // host for the cached OSMD container
  const osmdRef        = useRef<OpenSheetMusicDisplay | null>(null)
  const stepsRef       = useRef<number[]>([])
  const stepIdxRef     = useRef(0)
  const loadedRef      = useRef(false)
  const noteRefsRef    = useRef<NoteRef[]>([])
  const prevHighRef    = useRef<HTMLElement[]>([])
  const prevHighKeyRef = useRef<string>('')   // last highlighted svgId set — skip DOM when unchanged

  // Loading state: only true if the home-page preload didn't populate the
  // cache.  When the cache is hit (the common case) we start false so the
  // overlay never even renders → no flash, no transition jank.
  const [isLoading, setIsLoading] = useState(
    () => !getCachedSheet(midiFile.name, midiFile.bpm)
  )

  // Auto-scroll lock: true = scroll to keep cursor/highlights in view (default)
  const [autoScroll, setAutoScroll] = useState(true)
  const autoScrollRef = useRef(true)

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(v => { autoScrollRef.current = !v; return !v })
  }, [])

  // Sheet dark mode — persisted across the session.  Implemented as a CSS
  // filter (invert + hue-rotate) on the OSMD wrapper, so OSMD itself doesn't
  // need to know about colours; black notes become white, the white paper
  // becomes black, and the coloured highlights stay roughly the same hue.
  const [darkSheet, setDarkSheet] = useState(
    () => localStorage.getItem('sheetDarkMode') === 'true'
  )
  const toggleDarkSheet = useCallback(() => {
    setDarkSheet((v) => {
      const next = !v
      localStorage.setItem('sheetDarkMode', String(next))
      return next
    })
  }, [])

  // Block user wheel / touch scroll when auto-scroll lock is ON.
  // We need a non-passive listener so preventDefault() actually works.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!autoScroll) return          // lock OFF → allow free scrolling
    const block = (e: Event) => e.preventDefault()
    el.addEventListener('wheel',     block, { passive: false })
    el.addEventListener('touchmove', block, { passive: false })
    return () => {
      el.removeEventListener('wheel',     block)
      el.removeEventListener('touchmove', block)
    }
  }, [autoScroll])

  // ── Load OSMD (cache-first, with on-demand fallback) ───────────────────────
  //
  // Fast path: the home page pre-rendered the sheet into a detached container
  // before navigating here.  We just append that container into our wrapper
  // and read out cursor / refs — no parse, no render, no main-thread block.
  //
  // Slow path (fallback): no cache exists (preload failed or was skipped),
  // so we trigger preload now.  The loading overlay stays visible until done.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    loadedRef.current = false
    setIsLoading(true)
    clearHighlights(prevHighRef.current)
    prevHighKeyRef.current = ''
    resetScrollState()

    let cancelled = false

    const initFromCache = () => {
      const cached = attachCachedTo(midiFile.name, midiFile.bpm, wrapper)
      if (!cached || cancelled) return false

      const osmd = cached.osmd
      osmdRef.current = osmd

      // Reuse pre-computed refs+steps on re-attach (toggle off → on) so we
      // don't walk the OSMD tree every time.  First time through we compute
      // and stash them on the cache for subsequent toggles.
      const isReattach = !!cached.extras
      if (cached.extras) {
        noteRefsRef.current = cached.extras.noteRefs as NoteRef[]
        stepsRef.current    = cached.extras.steps
        stepIdxRef.current  = cached.extras.lastStepIdx
      } else {
        noteRefsRef.current = collectNoteRefs(osmd, bpm)

        const collected: number[] = []
        osmd.cursor.reset()
        while (!osmd.cursor.Iterator.EndReached) {
          collected.push(osmd.cursor.Iterator.currentTimeStamp.RealValue * 4 * 60 / bpm)
          osmd.cursor.next()
        }
        stepsRef.current = collected

        cached.extras = { noteRefs: noteRefsRef.current, steps: collected, lastStepIdx: 0 }
      }
      const steps = stepsRef.current
      osmd.cursor.show()

      // ── Position cursor at the current playback time ────────────────────────
      //
      // On FIRST load: reset and walk forward from 0 to the target step.
      // On RE-ATTACH: OSMD preserves cursor position across detach/attach in
      // the same instance.  Toggling off → on while playing only advances the
      // song by ~700 ms (one animation), so usually the saved step is within
      // a few of target — we just advance from there.  Skipping the full
      // reset-then-walk-from-0 saves up to a few hundred ms of cursor.next()
      // calls on long songs at later positions, which was the biggest cause
      // of the occasional toggle lag.
      const t0     = currentTimeRef.current
      const target = steps.length ? bsearchStep(steps, t0) : 0
      if (isReattach && stepIdxRef.current <= target && target - stepIdxRef.current <= 16) {
        // Forward delta within reason — just advance.
        while (stepIdxRef.current < target) { osmd.cursor.next(); stepIdxRef.current++ }
      } else {
        // First load OR rewind OR big jump — full reset.
        osmd.cursor.reset()
        for (let i = 0; i < target; i++) osmd.cursor.next()
        stepIdxRef.current = target
      }
      loadedRef.current = true

      // ── Initial scroll: center cursor row using live DOM position ───────────
      scrollToCursor(scrollRef.current, true)
      setIsLoading(false)
      return true
    }

    if (getCachedSheet(midiFile.name, midiFile.bpm)) {
      // Cache hit — attach synchronously.  No await, no block, no flash.
      initFromCache()
    } else {
      // Cache miss — preload on demand.  Yields to the browser first so the
      // overlay paints before the synchronous render block hits.
      preloadSheet(midiFile).then((ok) => {
        if (!ok || cancelled) return
        initFromCache()
      }).catch((err) => {
        console.error(err)
        if (!cancelled) setIsLoading(false)
      })
    }

    return () => {
      cancelled = true
      loadedRef.current = false
      // Persist the cursor position so the next attach can resume in O(delta)
      // instead of O(N) cursor.next() calls from 0.
      const cached = getCachedSheet(midiFile.name, midiFile.bpm)
      if (cached?.extras) cached.extras.lastStepIdx = stepIdxRef.current
      // Clear stale inline fill/stroke on previously-highlighted notes BEFORE
      // detaching: the cached container survives in body across toggles, so
      // any styles left here would resurrect when re-attached.
      clearHighlights(prevHighRef.current)
      prevHighKeyRef.current = ''
      // Move the cached container back to body BEFORE React unmounts our
      // wrapper — otherwise React would tear down our subtree and destroy the
      // pre-rendered SVG along with it.
      detachCachedToStorage(midiFile.name, midiFile.bpm)
    }
    // bpm derives from midiFile so it doesn't need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiFile])

  // ── Sync cursor position & auto-scroll ─────────────────────────────────────
  //
  // RAF-driven, NOT a useEffect on [currentTime].  The parent updates
  // currentTimeRef 60 × per second; tying this work to a React effect would
  // re-run cleanup+setup every frame and trigger SheetMusic re-renders that
  // ripple into FallingNotes / PianoKeyboard, dropping frames and making
  // played notes feel slightly behind the audio when the sheet is open.
  // Reading the ref inside our own RAF keeps it all out of React's reconciler.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (loadedRef.current && osmdRef.current) {
        const osmd  = osmdRef.current
        const steps = stepsRef.current
        if (steps.length) {
          const ct     = currentTimeRef.current
          const curIdx = stepIdxRef.current
          const target = bsearchStep(steps, ct)
          if (target !== curIdx) {
            if (target > curIdx && target - curIdx <= 3) {
              while (stepIdxRef.current < target) { osmd.cursor.next(); stepIdxRef.current++ }
            } else {
              osmd.cursor.reset()
              for (let i = 0; i < target; i++) osmd.cursor.next()
              stepIdxRef.current = target
            }
            if (autoScrollRef.current) scrollToCursor(scrollRef.current)
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [currentTimeRef])

  // ── Highlight full notes ────────────────────────────────────────────────────
  //
  // Driven by activeKeys (which MIDI numbers are currently playing) rather than
  // by currentTime.  This fires only at note boundaries (~4–8×/s) instead of
  // every RAF frame, eliminating CSS-transition frame-drop issues.
  //
  // Matching uses note.time (stored in activeKeys.time) for an exact lookup —
  // avoiding the "closest ref to currentTime" ambiguity that caused re-highlights
  // when the same pitch repeated quickly.  The ±150 ms window covers OSMD rounding
  // (~30 ms max) with plenty of margin.
  //
  // Practice mode: activeKeys.time is undefined → falls back to currentTimeRef for
  // approximate matching so the sheet still highlights the user's pressed key.

  useEffect(() => {
    if (!highlightMode || !loadedRef.current || !osmdRef.current) {
      if (prevHighKeyRef.current !== '') {
        clearHighlights(prevHighRef.current)
        prevHighKeyRef.current = ''
      }
      return
    }

    const refs = noteRefsRef.current

    // ── Strategy A: currentTime → VexFlow DOM id ─────────────────────────────
    if (refs.length > 0) {
      // Search by current playback position, NOT by individual note.time entries.
      //
      // Why not per-entry matching:
      //   Long-duration notes (e.g. a 2-beat bass note) stay in activeKeys while
      //   newer notes are added.  Each entry has a different .time, so searching
      //   ±80ms around each entry simultaneously highlights refs at 3+ different
      //   beat positions → "jumping" appearance.
      //
      // currentTimeRef.current is accurate: the RAF updates it before calling
      // setActiveKeys, so by the time this effect runs the ref is ≤ 32ms ahead
      // (1-2 frames), which is within the search window.
      //
      // We still do NOT match by ref.midi — OSMD Pitch.halfTone omits key-
      // signature accidentals, so ref.midi is wrong after a key change.
      const now    = currentTimeRef.current
      const WINDOW = 0.08   // ±80 ms — covers OSMD quantisation (≤27 ms at 70 BPM)

      const active: NoteRef[] = []
      const seenIds = new Set<string>()

      const lo = lowerBoundRefs(refs, now - WINDOW)
      for (let i = lo; i < refs.length; i++) {
        const ref = refs[i]
        if (ref.timeInSeconds > now + WINDOW) break
        if (seenIds.has(ref.svgId)) continue
        seenIds.add(ref.svgId)
        active.push(ref)
      }

      // Key-dedup: skip all DOM ops when the highlighted set hasn't changed.
      const key = active.map(r => r.svgId).sort().join(',')
      if (key === prevHighKeyRef.current) return
      prevHighKeyRef.current = key

      clearHighlights(prevHighRef.current)
      for (const { svgId, isRight, isBlack } of active) {
        colorFullNote(svgId, isRight, isBlack, prevHighRef.current)
      }
      return
    }

    // ── Strategy B (fallback): cursor x/y overlap with .vf-notehead ──────────
    const container = wrapperRef.current
    const cursorEl  = osmdRef.current.cursor.CursorElement as HTMLElement | null | undefined
    if (!container || !cursorEl) {
      if (prevHighKeyRef.current !== '') {
        clearHighlights(prevHighRef.current)
        prevHighKeyRef.current = ''
      }
      return
    }
    const cr = cursorEl.getBoundingClientRect()
    if (!cr.width || !cr.height) return

    const xL = cr.left - 8, xR = cr.right + 8
    const yT = cr.top - 60,  yB = cr.bottom + 60

    const fbKey = `B:${Math.round(xL)},${Math.round(yT)}`
    if (fbKey === prevHighKeyRef.current) return
    prevHighKeyRef.current = fbKey

    clearHighlights(prevHighRef.current)
    container.querySelectorAll<HTMLElement>('.vf-notehead').forEach(nh => {
      try {
        const r = nh.getBoundingClientRect()
        if (!r.width || !r.height || r.right < xL || r.left > xR || r.bottom < yT || r.top > yB) return
        nh.querySelectorAll<HTMLElement>('path').forEach(p => applyColor(p, true, false, prevHighRef.current))
      } catch { /* ignore */ }
    })
  }, [activeKeys, highlightMode])

  return (
    // Outer wrapper: fills the layout slot, provides positioning context for the
    // floating lock button (position:relative).
    <div className="flex-1 min-h-0 relative overflow-hidden">
      {/* Keyframes + filter rule for the dark-mode toggle.  Full invert + hue
          rotate so blacks become pure white, the white paper becomes a deep
          slate (not a washed-out grey), and the coloured highlights (blue /
          orange) stay roughly the same hue.  Contrast (1.05) sharpens the
          inverted notes a touch so they don't look hazy on the dark bg. */}
      <style>{`
        .sheet-osmd-host { transition: filter 320ms cubic-bezier(0.4, 0, 0.2, 1); }
        .sheet-osmd-host[data-dark="true"] {
          filter: invert(1) hue-rotate(180deg) contrast(1.05);
        }
        @keyframes themeIconIn {
          0%   { opacity: 0; transform: rotate(-90deg) scale(0.6); }
          100% { opacity: 1; transform: rotate(0)     scale(1);   }
        }
        @keyframes themeIconOut {
          0%   { opacity: 1; transform: rotate(0)    scale(1);   }
          100% { opacity: 0; transform: rotate(90deg) scale(0.6); }
        }
        .theme-icon-in  { animation: themeIconIn  280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      {/* Scrollable OSMD rendering area.
          IMPORTANT: Do NOT use both Tailwind `absolute` and inline position:relative —
          the inline style would override Tailwind and `inset-0` would stop working.
          Instead we set position:relative via CSS class on a wrapper, letting the
          OSMD cursor <img> (position:absolute) be contained inside the scroll area. */}
      <div
        ref={scrollRef}
        className={[
          'absolute inset-0 overflow-y-auto overflow-x-hidden transition-colors duration-300',
          darkSheet ? 'bg-[#0b1220]' : 'bg-white',
        ].join(' ')}
      >
        {/* Wrapper: the pre-rendered OSMD container (from sheetPreload) is
            appended here as a child on mount, and moved back to body on
            unmount so React doesn't tear it down with the rest of our DOM.
            When dark mode is on we apply an `invert + hue-rotate` filter so
            black notes/staff become white but the coloured highlights stay
            roughly the same hue.  The transition is animated for a smooth
            day → night swap. */}
        <div
          ref={wrapperRef}
          data-osmd-host
          className="sheet-osmd-host"
          data-dark={darkSheet ? 'true' : 'false'}
          style={{ position: 'relative', minHeight: '100%' }}
        />
      </div>

      {/* Loading overlay ─────────────────────────────────────────────────────
          Covers the area while OSMD parses + renders the score (a 1–2 s
          synchronous block on the main thread).  Without it the user sees a
          plain white flash — with it, they see a centred spinner + text and
          know something is happening.  Stays mounted but pointer-events:none
          when hidden so it can't accidentally swallow clicks. */}
      <div
        className={[
          'absolute inset-0 z-10 flex items-center justify-center bg-white',
          'transition-opacity duration-200',
          isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <div className="flex flex-col items-center gap-3 text-slate-500 select-none">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <div className="text-sm">Đang tải sheet nhạc...</div>
        </div>
      </div>

      {/* Auto-scroll lock button ─────────────────────────────────────────────
          Floats in the top-right corner over the sheet. Clicking toggles
          whether the view automatically scrolls to follow the highlighted notes. */}
      <button
        onClick={toggleAutoScroll}
        title={autoScroll ? 'Auto-scroll bật — nhấn để tắt' : 'Auto-scroll tắt — nhấn để bật'}
        className={[
          'absolute top-3 right-3 z-20',
          'w-8 h-8 rounded-full flex items-center justify-center',
          'shadow-md backdrop-blur-sm',
          'transition-all duration-200 select-none',
          autoScroll
            ? 'bg-blue-500/80 text-white hover:bg-blue-600/90 hover:scale-110'
            : 'bg-white/70 text-slate-400 border border-slate-200/60 hover:bg-white/90 hover:text-slate-600 hover:scale-110',
        ].join(' ')}
      >
        {autoScroll ? <LockClosedIcon /> : <LockOpenIcon />}
      </button>

      {/* Dark-mode toggle ────────────────────────────────────────────────────
          Sits directly below the lock button.  Icon swaps between sun and
          moon with a rotate + scale keyframe animation (re-keyed so each
          press replays the entrance).  Background colour transitions to
          match the current theme. */}
      <button
        onClick={toggleDarkSheet}
        title={darkSheet ? 'Chế độ tối — nhấn để chuyển sáng' : 'Chế độ sáng — nhấn để chuyển tối'}
        className={[
          'absolute top-[3.25rem] right-3 z-20',
          'w-8 h-8 rounded-full flex items-center justify-center',
          'shadow-md backdrop-blur-sm',
          'transition-all duration-300 select-none',
          darkSheet
            ? 'bg-slate-700/80 text-yellow-200 hover:bg-slate-700/95 hover:scale-110'
            : 'bg-white/70 text-slate-600 border border-slate-200/60 hover:bg-white/90 hover:text-slate-800 hover:scale-110',
        ].join(' ')}
      >
        <span key={darkSheet ? 'moon' : 'sun'} className="theme-icon-in inline-flex">
          {darkSheet ? <MoonIcon /> : <SunIcon />}
        </span>
      </button>
    </div>
  )
}

// Memoize so SheetMusic doesn't re-render when only currentTime-driven state
// changes upstream — we read currentTimeRef inside our own RAF instead.  All
// remaining props are stable references in PracticePage (midiFile, activeKeys
// only changes on note boundaries, etc.), so re-renders happen at note rate
// (~4–8 Hz) instead of frame rate (60 Hz).
export default React.memo(SheetMusic)
