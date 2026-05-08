import React, { useRef, useEffect, useState, useCallback } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { MidiNote, Hand } from '../types'

// ─── Duration table ───────────────────────────────────────────────────────────
const DIVS = 16

type DurDef = { div: number; type: string; dot?: true }
const DUR_TABLE: DurDef[] = [
  { div: 64, type: 'whole' },
  { div: 48, type: 'half',    dot: true },
  { div: 32, type: 'half' },
  { div: 24, type: 'quarter', dot: true },
  { div: 16, type: 'quarter' },
  { div: 12, type: 'eighth',  dot: true },
  { div:  8, type: 'eighth' },
  { div:  6, type: '16th',   dot: true },
  { div:  4, type: '16th' },
  { div:  2, type: '32nd' },
  { div:  1, type: '64th' },
]
function snapDur(divs: number): DurDef {
  return DUR_TABLE.reduce((b, d) => Math.abs(d.div - divs) < Math.abs(b.div - divs) ? d : b)
}

// ─── Pitch helpers ────────────────────────────────────────────────────────────
const PC_STEPS  = ['C','C','D','D','E','F','F','G','G','A','A','B']
const PC_ALTERS = [ 0,  1,  0,  1,  0,  0,  1,  0,  1,  0,  1,  0]
function midiPitch(midi: number) {
  const pc = midi % 12
  return { step: PC_STEPS[pc], octave: Math.floor(midi / 12) - 1, alter: PC_ALTERS[pc] }
}

// ─── XML helpers ──────────────────────────────────────────────────────────────
function noteEl(p: ReturnType<typeof midiPitch>, d: DurDef, staff: number, voice: number, chord: boolean): string {
  return ['<note>', chord ? '<chord/>' : '',
    `<pitch><step>${p.step}</step>`, p.alter ? `<alter>${p.alter}</alter>` : '',
    `<octave>${p.octave}</octave></pitch>`,
    `<duration>${d.div}</duration><voice>${voice}</voice><type>${d.type}</type>`,
    d.dot ? '<dot/>' : '', `<staff>${staff}</staff></note>`].join('')
}
function restEl(d: DurDef, staff: number, voice: number): string {
  return `<note><rest/><duration>${d.div}</duration><voice>${voice}</voice><type>${d.type}</type>${d.dot ? '<dot/>' : ''}<staff>${staff}</staff></note>`
}
function fillRests(total: number, staff: number, voice: number): string {
  let xml = '', rem = total
  while (rem > 0) {
    const d = DUR_TABLE.find(x => x.div <= rem) ?? DUR_TABLE[DUR_TABLE.length - 1]
    xml += restEl(d, staff, voice); rem -= d.div
  }
  return xml
}

// ─── MIDI → MusicXML ─────────────────────────────────────────────────────────
function midiToMusicXml(notes: MidiNote[], bpm: number, ts: { numerator: number; denominator: number }, activeHands: Hand[]): string {
  const bpm_    = Math.max(1, bpm)
  const divsPerM = Math.round(ts.numerator * (4 / ts.denominator) * DIVS)
  const toDivs   = (s: number) => Math.round(s * bpm_ / 60 * DIVS)

  const filtered = notes.filter(n => n.hand === 'unknown' || activeHands.includes(n.hand))
  if (!filtered.length) return ''

  const isRight = (n: MidiNote) => n.hand === 'right' || (n.hand !== 'left' && n.midi >= 60)
  const treble = filtered.filter(isRight)
  const bass   = filtered.filter(n => !isRight(n))

  const totalM = Math.ceil(Math.max(...filtered.map(n => toDivs(n.time + n.duration)), divsPerM) / divsPerM)

  const buildStaff = (sNotes: MidiNote[], staff: number, voice: number, mi: number): string => {
    const mStart = mi * divsPerM, mEnd = mStart + divsPerM
    type ND = { pos: number; dur: DurDef; midi: number }
    const inM: ND[] = sNotes
      .filter(n => { const d = toDivs(n.time); return d >= mStart && d < mEnd })
      .map(n => ({ pos: toDivs(n.time) - mStart, dur: snapDur(Math.max(1, Math.min(toDivs(n.duration), mEnd - toDivs(n.time)))), midi: n.midi }))
      .sort((a, b) => a.pos - b.pos || a.midi - b.midi)
    const cm = new Map<number, ND[]>()
    for (const n of inM) { if (!cm.has(n.pos)) cm.set(n.pos, []); cm.get(n.pos)!.push(n) }
    let xml = '', cur = 0
    for (const [pos, chord] of [...cm.entries()].sort((a, b) => a[0] - b[0])) {
      if (pos > cur) { xml += fillRests(pos - cur, staff, voice); cur = pos }
      const act = snapDur(Math.min(chord[0].dur.div, divsPerM - pos))
      chord.forEach((n, i) => { xml += noteEl(midiPitch(n.midi), act, staff, voice, i > 0) })
      cur = pos + act.div
    }
    if (divsPerM - cur > 0) xml += fillRests(divsPerM - cur, staff, voice)
    return xml
  }

  const measures = Array.from({ length: totalM }, (_, m) => {
    let x = `<measure number="${m + 1}">`
    if (m === 0) x += [
      `<attributes><divisions>${DIVS}</divisions><key><fifths>0</fifths></key>`,
      `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>`,
      `<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>`,
      `<clef number="2"><sign>F</sign><line>4</line></clef></attributes>`,
      `<direction placement="above"><direction-type><metronome parentheses="no">`,
      `<beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm_)}</per-minute>`,
      `</metronome></direction-type><sound tempo="${Math.round(bpm_)}"/></direction>`,
    ].join('')
    x += buildStaff(treble, 1, 1, m)
    x += `<backup><duration>${divsPerM}</duration></backup>`
    x += buildStaff(bass, 2, 2, m)
    return x + '</measure>'
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">',
    measures.join(''), '</part></score-partwise>',
  ].join('')
}

// ─── Binary search for cursor step ───────────────────────────────────────────
function bsearchStep(steps: number[], t: number): number {
  if (!steps.length) return 0
  let lo = 0, hi = steps.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (steps[mid] <= t) lo = mid; else hi = mid - 1 }
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

                const durWN = gnote.sourceNote?.Length?.RealValue ?? 0.25
                refs.push({
                  timeInSeconds,
                  durSeconds: Math.max(0.05, durWN * 4 * 60 / bpm_),
                  svgId,
                  isRight,
                  isBlack,
                })
              } catch { /* ignore */ }
            }
          }
        }
      }
    }
  } catch (e) { console.warn('[SheetMusic] collectNoteRefs:', e) }
  console.log('[SheetMusic] collected', refs.length, 'note refs')
  return refs
}

// ─── Highlight color & transition ─────────────────────────────────────────────
// Inject one global CSS rule (once per page) that gives every path inside the
// OSMD container a smooth fill transition.  This makes highlights fade in/out
// automatically without per-element style management.
const STYLE_ID = 'sheet-music-path-transitions'
function ensureTransitionStyle() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  // Scope to elements that carry data-osmd so we don't affect the rest of the UI.
  // The transition applies to the fill property of every SVG path inside OSMD.
  s.textContent = `
    [data-osmd] svg path {
      transition: fill 0.12s ease, stroke 0.12s ease;
    }
  `
  document.head.appendChild(s)
}

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

// ─── Component ────────────────────────────────────────────────────────────────
interface SheetMusicProps {
  notes:          MidiNote[]
  bpm:            number
  timeSignature:  { numerator: number; denominator: number }
  currentTime:    number
  activeHands:    Hand[]
  highlightMode?: boolean
}

export default function SheetMusic({
  notes, bpm, timeSignature, currentTime, activeHands, highlightMode = false
}: SheetMusicProps): React.JSX.Element {
  const scrollRef      = useRef<HTMLDivElement>(null)   // the overflow-y-auto scroll wrapper
  const containerRef   = useRef<HTMLDivElement>(null)   // the inner OSMD rendering target
  const osmdRef        = useRef<OpenSheetMusicDisplay | null>(null)
  const stepsRef       = useRef<number[]>([])
  const stepIdxRef     = useRef(0)
  const loadedRef      = useRef(false)
  const currentTimeRef = useRef(currentTime)
  const noteRefsRef    = useRef<NoteRef[]>([])
  const prevHighRef    = useRef<HTMLElement[]>([])

  // Auto-scroll lock: true = scroll to keep cursor/highlights in view (default)
  const [autoScroll, setAutoScroll] = useState(true)
  const autoScrollRef = useRef(true)

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(v => { autoScrollRef.current = !v; return !v })
  }, [])

  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])

  // Inject CSS transition rule once on mount
  useEffect(() => { ensureTransitionStyle() }, [])

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

  // ── Build and load OSMD ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    loadedRef.current = false
    clearHighlights(prevHighRef.current)
    resetScrollState()

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const xml = midiToMusicXml(notes, bpm, timeSignature, activeHands)
      if (!xml || cancelled) return

      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(el, {
          autoResize: false,   // keep VexFlow IDs stable (no re-render → no stale ids)
          drawingParameters: 'compact',
          drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false,
          cursorsOptions: [{ type: 0, color: '#3b82f6', alpha: 0.15, follow: false }],
        })
      }

      const osmd = osmdRef.current
      osmd.load(xml).then(() => {
        if (cancelled) return
        osmd.render()

        noteRefsRef.current = collectNoteRefs(osmd, bpm)

        // ── Collect step timestamps ───────────────────────────────────────────────
        const steps: number[] = []
        osmd.cursor.reset()
        osmd.cursor.show()
        while (!osmd.cursor.Iterator.EndReached) {
          steps.push(osmd.cursor.Iterator.currentTimeStamp.RealValue * 4 * 60 / bpm)
          osmd.cursor.next()
        }
        stepsRef.current = steps

        // ── Position cursor at the current playback time ─────────────────────────
        const t0       = currentTimeRef.current
        const initStep = steps.length ? bsearchStep(steps, t0) : 0
        osmd.cursor.reset()
        for (let i = 0; i < initStep; i++) osmd.cursor.next()
        stepIdxRef.current = initStep
        loadedRef.current = true

        // ── Initial scroll: center cursor row using live DOM position ─────────────
        // osmd.cursor.CursorElement is null in OSMD 1.9.9 — query by OSMD's own ID.
        // force=true: skip threshold check so we always land on the right row at start.
        scrollToCursor(scrollRef.current, true)
      }).catch(console.error)
    }, 80)

    return () => { cancelled = true; clearTimeout(timer); loadedRef.current = false }
  }, [notes, bpm, timeSignature, activeHands])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync cursor position & auto-scroll ─────────────────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !osmdRef.current) return
    const osmd  = osmdRef.current
    const steps = stepsRef.current
    if (!steps.length) return

    const curIdx = stepIdxRef.current
    const target = bsearchStep(steps, currentTime)
    const moved  = target !== curIdx
    if (moved) {
      if (target > curIdx && target - curIdx <= 3) {
        while (stepIdxRef.current < target) { osmd.cursor.next(); stepIdxRef.current++ }
      } else {
        osmd.cursor.reset()
        for (let i = 0; i < target; i++) osmd.cursor.next()
        stepIdxRef.current = target
      }
    }

    // Auto-scroll: center cursor row when step advances.
    if (autoScrollRef.current && moved) {
      scrollToCursor(scrollRef.current)
    }
  }, [currentTime])

  // ── Highlight full notes (throttled to 16th-note boundaries) ───────────────
  //
  // Strategy A: use timing + VexFlow DOM ids to find each active note's group.
  //   Colors notehead paths, stem, and ledger lines — the full note.
  //
  // Strategy B (fallback): cursor x+y position overlap with .vf-notehead class.
  //   Activates when getSVGId() returned nothing for all notes.
  const beat16 = Math.floor(currentTime * bpm / 60 * 4)

  useEffect(() => {
    clearHighlights(prevHighRef.current)
    if (!highlightMode || !loadedRef.current || !osmdRef.current) return

    const t    = currentTimeRef.current
    const refs = noteRefsRef.current

    // Strategy A ──────────────────────────────────────────────────────────────
    if (refs.length > 0) {
      let found = 0
      for (const { timeInSeconds, durSeconds, svgId, isRight, isBlack } of refs) {
        if (t < timeInSeconds - 0.08 || t >= timeInSeconds + durSeconds + 0.05) continue
        colorFullNote(svgId, isRight, isBlack, prevHighRef.current)
        found++
      }
      if (found > 0) return
    }

    // Strategy B (fallback) ───────────────────────────────────────────────────
    const container = containerRef.current
    const cursorEl  = osmdRef.current.cursor.CursorElement as HTMLElement | null | undefined
    if (!container || !cursorEl) return
    const cr = cursorEl.getBoundingClientRect()
    if (!cr.width || !cr.height) return

    const xL = cr.left - 8, xR = cr.right + 8
    const yT = cr.top - 60,  yB = cr.bottom + 60

    container.querySelectorAll<HTMLElement>('.vf-notehead').forEach(nh => {
      try {
        const r = nh.getBoundingClientRect()
        if (!r.width || !r.height || r.right < xL || r.left > xR || r.bottom < yT || r.top > yB) return
        // Fallback: no hand info available, default to right-white colour
        nh.querySelectorAll<HTMLElement>('path').forEach(p => applyColor(p, true, false, prevHighRef.current))
      } catch { /* ignore */ }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat16, highlightMode])

  // Clear when highlight mode turns off
  useEffect(() => {
    if (!highlightMode) clearHighlights(prevHighRef.current)
  }, [highlightMode])

  return (
    // Outer wrapper: fills the layout slot, provides positioning context for the
    // floating lock button (position:relative).
    <div className="flex-1 min-h-0 relative overflow-hidden">

      {/* Scrollable OSMD rendering area.
          IMPORTANT: Do NOT use both Tailwind `absolute` and inline position:relative —
          the inline style would override Tailwind and `inset-0` would stop working.
          Instead we set position:relative via CSS class on a wrapper, letting the
          OSMD cursor <img> (position:absolute) be contained inside the scroll area. */}
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-white">
        {/* Inner div carries position:relative so the OSMD cursor <img>
            (position:absolute) is positioned relative to this element — keeping
            cursor coords aligned with SVG note elements when scrolled. */}
        <div
          ref={containerRef}
          data-osmd
          style={{ position: 'relative', minHeight: '100%' }}
        />
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
    </div>
  )
}
