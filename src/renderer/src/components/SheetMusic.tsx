import React, { useRef, useEffect } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { MidiNote, Hand } from '../types'

// ─── Duration table (DIVS = 16th note units; 16 per quarter note) ─────────────
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
  return DUR_TABLE.reduce((best, d) =>
    Math.abs(d.div - divs) < Math.abs(best.div - divs) ? d : best
  )
}

// ─── Pitch helpers ────────────────────────────────────────────────────────────
const PC_STEPS  = ['C','C','D','D','E','F','F','G','G','A','A','B']
const PC_ALTERS = [ 0,  1,  0,  1,  0,  0,  1,  0,  1,  0,  1,  0]

function midiPitch(midi: number) {
  const pc = midi % 12
  return { step: PC_STEPS[pc], octave: Math.floor(midi / 12) - 1, alter: PC_ALTERS[pc] }
}

// ─── XML element helpers ──────────────────────────────────────────────────────
function noteEl(
  pitch: ReturnType<typeof midiPitch>,
  dur: DurDef,
  staff: number,
  voice: number,
  chord: boolean
): string {
  const { step, octave, alter } = pitch
  return [
    '<note>',
    chord ? '<chord/>' : '',
    `<pitch><step>${step}</step>`,
    alter ? `<alter>${alter}</alter>` : '',
    `<octave>${octave}</octave></pitch>`,
    `<duration>${dur.div}</duration>`,
    `<voice>${voice}</voice>`,
    `<type>${dur.type}</type>`,
    dur.dot ? '<dot/>' : '',
    `<staff>${staff}</staff>`,
    '</note>',
  ].join('')
}

function restEl(dur: DurDef, staff: number, voice: number): string {
  return [
    '<note><rest/>',
    `<duration>${dur.div}</duration>`,
    `<voice>${voice}</voice>`,
    `<type>${dur.type}</type>`,
    dur.dot ? '<dot/>' : '',
    `<staff>${staff}</staff></note>`,
  ].join('')
}

function fillRests(totalDiv: number, staff: number, voice: number): string {
  let xml = '', rem = totalDiv
  while (rem > 0) {
    const d = DUR_TABLE.find(x => x.div <= rem) ?? DUR_TABLE[DUR_TABLE.length - 1]
    xml += restEl(d, staff, voice)
    rem -= d.div
  }
  return xml
}

// ─── MIDI → MusicXML ──────────────────────────────────────────────────────────
function midiToMusicXml(
  notes: MidiNote[],
  bpm: number,
  ts: { numerator: number; denominator: number },
  activeHands: Hand[]
): string {
  const bpm_     = Math.max(1, bpm)
  const beatsPerM = ts.numerator * (4 / ts.denominator)
  const divsPerM  = Math.round(beatsPerM * DIVS)

  const toDivs = (s: number) => Math.round(s * bpm_ / 60 * DIVS)

  // Same filter as before: unknown notes always shown, known notes must be in activeHands
  const filtered = notes.filter(n => n.hand === 'unknown' || activeHands.includes(n.hand))
  if (!filtered.length) return ''

  const isRight = (n: MidiNote) => n.hand === 'right' || (n.hand !== 'left' && n.midi >= 60)
  const treble = filtered.filter(isRight)
  const bass   = filtered.filter(n => !isRight(n))

  const totalDivs = Math.max(...filtered.map(n => toDivs(n.time + n.duration)), divsPerM)
  const totalM    = Math.ceil(totalDivs / divsPerM)

  const buildStaff = (staffNotes: MidiNote[], staff: number, voice: number, mi: number): string => {
    const mStart = mi * divsPerM
    const mEnd   = mStart + divsPerM

    type ND = { pos: number; dur: DurDef; midi: number }
    const inM: ND[] = staffNotes
      .filter(n => { const d = toDivs(n.time); return d >= mStart && d < mEnd })
      .map(n => ({
        pos: toDivs(n.time) - mStart,
        dur: snapDur(Math.max(1, Math.min(toDivs(n.duration), mEnd - toDivs(n.time)))),
        midi: n.midi,
      }))
      .sort((a, b) => a.pos - b.pos || a.midi - b.midi)

    // Group simultaneous notes into chords
    const chordMap = new Map<number, ND[]>()
    for (const n of inM) {
      if (!chordMap.has(n.pos)) chordMap.set(n.pos, [])
      chordMap.get(n.pos)!.push(n)
    }

    let xml = '', cursor = 0
    for (const [pos, chord] of [...chordMap.entries()].sort((a, b) => a[0] - b[0])) {
      if (pos > cursor) { xml += fillRests(pos - cursor, staff, voice); cursor = pos }
      const actual = snapDur(Math.min(chord[0].dur.div, divsPerM - pos))
      chord.forEach((n, i) => { xml += noteEl(midiPitch(n.midi), actual, staff, voice, i > 0) })
      cursor = pos + actual.div
    }
    if (divsPerM - cursor > 0) xml += fillRests(divsPerM - cursor, staff, voice)
    return xml
  }

  const measures = Array.from({ length: totalM }, (_, m) => {
    let xml = `<measure number="${m + 1}">`
    if (m === 0) {
      xml += [
        '<attributes>',
        `<divisions>${DIVS}</divisions>`,
        '<key><fifths>0</fifths></key>',
        `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>`,
        '<staves>2</staves>',
        '<clef number="1"><sign>G</sign><line>2</line></clef>',
        '<clef number="2"><sign>F</sign><line>4</line></clef>',
        '</attributes>',
        '<direction placement="above">',
        '<direction-type>',
        '<metronome parentheses="no">',
        '<beat-unit>quarter</beat-unit>',
        `<per-minute>${Math.round(bpm_)}</per-minute>`,
        '</metronome></direction-type>',
        `<sound tempo="${Math.round(bpm_)}"/>`,
        '</direction>',
      ].join('')
    }
    xml += buildStaff(treble, 1, 1, m)
    xml += `<backup><duration>${divsPerM}</duration></backup>`
    xml += buildStaff(bass, 2, 2, m)
    xml += '</measure>'
    return xml
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"',
    ' "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>',
    '<part id="P1">',
    measures.join(''),
    '</part></score-partwise>',
  ].join('')
}

// ─── Component ────────────────────────────────────────────────────────────────
interface SheetMusicProps {
  notes:          MidiNote[]
  bpm:            number
  timeSignature:  { numerator: number; denominator: number }
  currentTime:    number
  activeHands:    Hand[]
  highlightMode?: boolean   // true = show cursor overlay on current notes
}

export default function SheetMusic({
  notes, bpm, timeSignature, currentTime, activeHands, highlightMode = false
}: SheetMusicProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const osmdRef      = useRef<OpenSheetMusicDisplay | null>(null)
  const stepsRef     = useRef<number[]>([])   // seconds for each cursor step
  const stepIdxRef   = useRef(0)
  const loadedRef    = useRef(false)
  const hlRef        = useRef(highlightMode)

  useEffect(() => { hlRef.current = highlightMode }, [highlightMode])

  // ── Build XML and (re)load OSMD whenever song data changes ─────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    loadedRef.current = false

    const xml = midiToMusicXml(notes, bpm, timeSignature, activeHands)
    if (!xml) return

    let cancelled = false

    // Create OSMD once per container mount
    if (!osmdRef.current) {
      osmdRef.current = new OpenSheetMusicDisplay(el, {
        autoResize: true,
        drawingParameters: 'compact',
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawLyricist: false,
        // Green cursor box around current beat's notes
        cursorsOptions: [{ type: 0, color: '#16a34a', alpha: 0.7, follow: false }],
      })
    }

    const osmd = osmdRef.current

    osmd.load(xml).then(() => {
      if (cancelled) return
      osmd.render()

      // Pre-compute seconds for each cursor step
      // currentTimeStamp.RealValue is in whole notes (1.0 = 4 quarter notes)
      const steps: number[] = []
      osmd.cursor.reset()
      while (!osmd.cursor.Iterator.EndReached) {
        steps.push(osmd.cursor.Iterator.currentTimeStamp.RealValue * 4 * 60 / bpm)
        osmd.cursor.next()
      }

      stepsRef.current  = steps
      stepIdxRef.current = 0
      osmd.cursor.reset()

      if (hlRef.current) osmd.cursor.show()
      else               osmd.cursor.hide()

      loadedRef.current = true
    }).catch(console.error)

    return () => { cancelled = true; loadedRef.current = false }
  }, [notes, bpm, timeSignature, activeHands])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync cursor to currentTime (runs every frame during playback) ───────────
  useEffect(() => {
    if (!loadedRef.current || !osmdRef.current) return
    const osmd  = osmdRef.current
    const steps = stepsRef.current
    if (!steps.length) return

    const t   = currentTime
    const idx = stepIdxRef.current

    if (t < (steps[idx] ?? 0) - 0.1) {
      // ── Seek backward: binary-search + reset + advance ──────────────────────
      let lo = 0, hi = steps.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (steps[mid] <= t) lo = mid; else hi = mid - 1
      }
      // Hide during batch advance to avoid visual flicker
      const wasVisible = hlRef.current
      if (wasVisible) osmd.cursor.hide()
      osmd.cursor.reset()
      for (let i = 0; i < lo; i++) osmd.cursor.next()
      stepIdxRef.current = lo
      if (wasVisible) osmd.cursor.show()
    } else {
      // ── Advance forward (usually 0–1 steps per frame) ──────────────────────
      while (stepIdxRef.current + 1 < steps.length && steps[stepIdxRef.current + 1] <= t) {
        osmd.cursor.next()
        stepIdxRef.current++
      }
    }

    // Scroll cursor into view
    const scrollEl = containerRef.current
    const cursorEl = osmd.cursor.CursorElement as HTMLElement | null | undefined
    if (scrollEl && cursorEl) {
      const cursorRect    = cursorEl.getBoundingClientRect()
      const containerRect = scrollEl.getBoundingClientRect()
      const relTop  = cursorRect.top - containerRect.top + scrollEl.scrollTop
      const scrollTop = scrollEl.scrollTop
      const clientH   = scrollEl.clientHeight
      if (relTop < scrollTop + 60 || relTop > scrollTop + clientH - 100) {
        scrollEl.scrollTo({ top: Math.max(0, relTop - clientH / 2), behavior: 'smooth' })
      }
    }
  }, [currentTime])

  // ── Show / hide cursor when highlightMode changes ───────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !osmdRef.current) return
    if (highlightMode) osmdRef.current.cursor.show()
    else               osmdRef.current.cursor.hide()
  }, [highlightMode])

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white"
    />
  )
}
