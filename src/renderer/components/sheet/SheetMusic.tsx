import React, { useRef, useEffect, useState, useCallback } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { MidiFileData, Hand } from '../../types'
import { getCachedSheet, preloadSheet, attachCachedTo, detachCachedToStorage } from './sheetPreload'
import { collectNoteRefs, bsearchStep, lowerBoundRefs, type NoteRef } from './noteRefs'
import { clearHighlights, colorFullNote } from './highlighting'
import { resetScrollState, scrollToCursor } from './scrollToCursor'
import { useLanguage } from '../../i18n/LanguageContext'

// ─── Floating-button icons ───────────────────────────────────────────────────
function LockClosedIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  )
}
function LockOpenIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 1C9.24 1 7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 13c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
    </svg>
  )
}
function SunIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM4.22 5.64a1 1 0 011.42 0l1.41 1.41a1 1 0 11-1.41 1.42L4.22 7.05a1 1 0 010-1.41zm12.73 12.72a1 1 0 011.41 0l1.42 1.41a1 1 0 11-1.42 1.42l-1.41-1.42a1 1 0 010-1.41zM2 12a1 1 0 011-1h2a1 1 0 110 2H3a1 1 0 01-1-1zm17 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zM5.64 19.78a1 1 0 010-1.42l1.41-1.41a1 1 0 011.42 1.41l-1.42 1.42a1 1 0 01-1.41 0zm12.72-12.73a1 1 0 010-1.41l1.41-1.42a1 1 0 011.42 1.42l-1.42 1.41a1 1 0 01-1.41 0z"/>
    </svg>
  )
}
function MoonIcon(): React.JSX.Element {
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
  // second by the parent's RAF.  Receiving it as a prop would re-render this
  // component every frame, drop frames during playback (perceived as audio
  // stutter), and force the cursor-sync effect through React's reconciler.
  // A stable ref lets us read the value in our own RAF loop without re-rendering.
  currentTimeRef: React.MutableRefObject<number>
  activeKeys:     Map<number, { hand: Hand; hitState?: string; time?: number }>
  highlightMode?: boolean
}

const SHEET_STYLE = `
.sheet-osmd-host { transition: filter 320ms cubic-bezier(0.4, 0, 0.2, 1); }
.sheet-osmd-host[data-dark="true"] {
  filter: invert(1) hue-rotate(180deg) contrast(1.05);
}
@keyframes sheetThemeIconIn {
  0%   { opacity: 0; transform: rotate(-90deg) scale(0.6); }
  100% { opacity: 1; transform: rotate(0)     scale(1);   }
}
.sheet-theme-icon-in { animation: sheetThemeIconIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`

function SheetMusic({
  midiFile, currentTimeRef, activeKeys, highlightMode = false,
}: SheetMusicProps): React.JSX.Element {
  const { t } = useLanguage()
  const bpm            = midiFile.bpm
  const scrollRef      = useRef<HTMLDivElement>(null)
  const wrapperRef     = useRef<HTMLDivElement>(null)
  const osmdRef        = useRef<OpenSheetMusicDisplay | null>(null)
  const stepsRef       = useRef<number[]>([])
  const stepIdxRef     = useRef(0)
  const loadedRef      = useRef(false)
  const noteRefsRef    = useRef<NoteRef[]>([])
  const prevHighRef    = useRef<HTMLElement[]>([])
  const prevHighKeyRef = useRef<string>('')

  // Loading state — only true when the home-page preload didn't already
  // populate the cache (the common case starts false ⇒ no flash, no jank).
  const [isLoading, setIsLoading] = useState(
    () => !getCachedSheet(midiFile.name, midiFile.bpm)
  )

  // Auto-scroll lock: true = scroll to keep cursor in view.
  const [autoScroll, setAutoScroll] = useState(true)
  const autoScrollRef = useRef(true)
  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(v => { autoScrollRef.current = !v; return !v })
  }, [])

  // Sheet dark mode — session-only (never persisted) so each entry into the
  // practice page starts on light.  Implemented as a CSS filter on the OSMD
  // wrapper (see SHEET_STYLE): black ink becomes pure white, paper becomes a
  // deep navy, coloured highlights stay roughly the same hue.
  const [darkSheet, setDarkSheet] = useState(false)
  const toggleDarkSheet = useCallback(() => setDarkSheet(v => !v), [])

  // Block wheel + touch scroll while the lock is on.  Non-passive listeners
  // are required for preventDefault() to actually cancel.  Also snap back to
  // the cursor when the lock flips on, in case the user scrolled away while
  // it was off — otherwise the next scroll wouldn't happen until the cursor
  // advanced to a new step.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !autoScroll) return
    if (loadedRef.current) scrollToCursor(el, true)
    const block = (e: Event) => e.preventDefault()
    el.addEventListener('wheel',     block, { passive: false })
    el.addEventListener('touchmove', block, { passive: false })
    return () => {
      el.removeEventListener('wheel',     block)
      el.removeEventListener('touchmove', block)
    }
  }, [autoScroll])

  // ── Load OSMD (cache-first, with on-demand fallback) ──────────────────────
  // Fast path: home page pre-rendered the sheet into a detached container.
  // We just append it into our wrapper and read out cursor / refs — no parse,
  // no render, no main-thread block.
  // Slow path: nothing cached (preload failed or skipped).  Preload now,
  // overlay stays visible until done.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    loadedRef.current = false
    setIsLoading(true)
    clearHighlights(prevHighRef.current)
    prevHighKeyRef.current = ''
    resetScrollState()

    let cancelled = false

    const initFromCache = (): boolean => {
      const cached = attachCachedTo(midiFile.name, midiFile.bpm, wrapper)
      if (!cached || cancelled) return false

      const osmd = cached.osmd
      osmdRef.current = osmd

      // Reuse pre-computed refs+steps on re-attach (toggle off → on).
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

      // Position cursor at the current playback time.  On first load: reset
      // and walk forward from 0.  On re-attach the OSMD instance kept its
      // cursor where we left it, so only advance the small delta — that
      // saves up to a few hundred ms of cursor.next() calls on long songs.
      const t0     = currentTimeRef.current
      const target = steps.length ? bsearchStep(steps, t0) : 0
      if (isReattach && stepIdxRef.current <= target && target - stepIdxRef.current <= 16) {
        while (stepIdxRef.current < target) { osmd.cursor.next(); stepIdxRef.current++ }
      } else {
        osmd.cursor.reset()
        for (let i = 0; i < target; i++) osmd.cursor.next()
        stepIdxRef.current = target
      }
      loadedRef.current = true

      scrollToCursor(scrollRef.current, true)
      setIsLoading(false)
      return true
    }

    if (getCachedSheet(midiFile.name, midiFile.bpm)) {
      initFromCache()
    } else {
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
      // Persist the cursor position so the next attach can resume in O(delta).
      const cached = getCachedSheet(midiFile.name, midiFile.bpm)
      if (cached?.extras) cached.extras.lastStepIdx = stepIdxRef.current
      // Clear inline fill/stroke BEFORE detaching: cached container survives
      // in body across toggles, so styles left here would resurrect on attach.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearHighlights(prevHighRef.current)
      prevHighKeyRef.current = ''
      // Move the cached container back to body BEFORE React unmounts our
      // wrapper — otherwise React would tear down our subtree and destroy
      // the pre-rendered SVG with it.
      detachCachedToStorage(midiFile.name, midiFile.bpm)
    }
    // bpm derives from midiFile so it doesn't need to be in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiFile])

  // ── Cursor sync (RAF, not React effect) ───────────────────────────────────
  // Tying this to a `[currentTime]` useEffect would run the effect 60 × per
  // second through React's reconciler and ripple re-renders into siblings,
  // dropping frames.  RAF reading the ref keeps it out of React entirely.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
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

  // ── Width re-render ───────────────────────────────────────────────────────
  // OSMD preloads at the window width at the time the file was picked, with
  // autoResize: false.  When the user toggles fullscreen (or resizes), the
  // SVG keeps its old narrow width, leaving white space on the right.  We
  // observe the wrapper and re-render the active OSMD instance when its
  // available width changes.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    let prevWidth = el.clientWidth
    let timer: ReturnType<typeof setTimeout> | null = null
    const rerender = (): void => {
      const osmd = osmdRef.current
      if (!osmd || !loadedRef.current) return
      try {
        clearHighlights(prevHighRef.current)
        prevHighKeyRef.current = ''
        osmd.render()
        osmd.cursor.show()
        noteRefsRef.current = collectNoteRefs(osmd, bpm)
        const steps  = stepsRef.current
        const target = steps.length ? bsearchStep(steps, currentTimeRef.current) : 0
        osmd.cursor.reset()
        for (let i = 0; i < target; i++) osmd.cursor.next()
        stepIdxRef.current = target
        if (autoScrollRef.current) scrollToCursor(scrollRef.current, true)
      } catch (e) { console.error('[SheetMusic resize re-render]', e) }
    }
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === 0 || w === prevWidth) return
      prevWidth = w
      if (timer) clearTimeout(timer)
      timer = setTimeout(rerender, 150)
    })
    ro.observe(el)
    return () => { ro.disconnect(); if (timer) clearTimeout(timer) }
  }, [bpm, currentTimeRef])

  // ── Note highlighting ─────────────────────────────────────────────────────
  // Triggered by activeKeys changes (~4–8 Hz at note boundaries) rather than
  // currentTime (60 Hz) so we don't churn the DOM on every frame.
  //
  // Matching is by time + staff (not MIDI number): OSMD's Pitch.halfTone
  // ignores key-signature accidentals, so MIDI-number matching breaks after
  // a key change.  Using currentTimeRef.current ±80 ms covers OSMD's
  // quantisation error (~27 ms at 70 BPM) without bleeding into neighbours.
  useEffect(() => {
    if (!highlightMode || !loadedRef.current || !osmdRef.current) {
      if (prevHighKeyRef.current !== '') {
        clearHighlights(prevHighRef.current)
        prevHighKeyRef.current = ''
      }
      return
    }

    const refs = noteRefsRef.current
    if (refs.length === 0) return

    const now    = currentTimeRef.current
    const WINDOW = 0.08
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

    // Key-dedup so the same active set doesn't repaint DOM.
    const key = active.map(r => r.svgId).sort().join(',')
    if (key === prevHighKeyRef.current) return
    prevHighKeyRef.current = key

    clearHighlights(prevHighRef.current)
    for (const { svgId, isRight, isBlack } of active) {
      colorFullNote(svgId, isRight, isBlack, prevHighRef.current)
    }
  }, [activeKeys, highlightMode, currentTimeRef])

  return (
    <div className="flex-1 min-h-0 relative overflow-hidden">
      <style>{SHEET_STYLE}</style>

      {/* Scrollable OSMD rendering area */}
      <div
        ref={scrollRef}
        className={[
          'absolute inset-0 overflow-y-auto overflow-x-hidden transition-colors duration-300',
          darkSheet ? 'bg-[#0b1220]' : 'bg-white',
        ].join(' ')}
      >
        {/* Host for the pre-rendered OSMD container.  In dark mode the
            `invert + hue-rotate` filter on this wrapper flips the print
            colours while leaving the coloured highlights roughly intact. */}
        <div
          ref={wrapperRef}
          data-osmd-host
          className="sheet-osmd-host"
          data-dark={darkSheet ? 'true' : 'false'}
          style={{ position: 'relative', minHeight: '100%' }}
        />
      </div>

      {/* Loading overlay — fades out when ready. */}
      <div
        className={[
          'absolute inset-0 z-10 flex items-center justify-center bg-white',
          'transition-opacity duration-200',
          isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <div className="flex flex-col items-center gap-3 text-slate-500 select-none">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <div className="text-sm">{t('loadingSheet')}</div>
        </div>
      </div>

      {/* Auto-scroll lock — top-right corner */}
      <button
        onClick={toggleAutoScroll}
        title={autoScroll ? t('autoScrollOnHint') : t('autoScrollOffHint')}
        className={[
          'absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center',
          'shadow-md backdrop-blur-sm ring-1',
          'transition-[background-color,color,box-shadow,border-color] duration-150 select-none',
          autoScroll
            ? 'bg-blue-500/80 text-white ring-blue-300/30 hover:bg-blue-600 hover:ring-blue-300/60 hover:shadow-blue-500/40'
            : 'bg-white/70 text-slate-400 border border-slate-200/60 ring-transparent hover:bg-white hover:text-slate-600 hover:ring-slate-300/60',
        ].join(' ')}
      >
        {autoScroll ? <LockClosedIcon /> : <LockOpenIcon />}
      </button>

      {/* Dark-mode toggle — directly below the lock button */}
      <button
        onClick={toggleDarkSheet}
        title={darkSheet ? t('darkSheetHint') : t('lightSheetHint')}
        className={[
          'absolute top-[3.25rem] right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center',
          'shadow-md backdrop-blur-sm ring-1',
          'transition-[background-color,color,box-shadow,border-color] duration-200 select-none',
          darkSheet
            ? 'bg-slate-700/85 text-yellow-200 ring-yellow-300/20 hover:bg-slate-700 hover:ring-yellow-300/50'
            : 'bg-white/70 text-slate-600 border border-slate-200/60 ring-transparent hover:bg-white hover:text-slate-800 hover:ring-slate-300/60',
        ].join(' ')}
      >
        <span key={darkSheet ? 'moon' : 'sun'} className="sheet-theme-icon-in inline-flex">
          {darkSheet ? <MoonIcon /> : <SunIcon />}
        </span>
      </button>
    </div>
  )
}

// Memoise so SheetMusic re-renders only when activeKeys / midiFile /
// highlightMode actually change — never on currentTime, which is delivered
// via the stable currentTimeRef and consumed inside our own RAF.
export default React.memo(SheetMusic)
