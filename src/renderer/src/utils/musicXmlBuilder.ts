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

// Pick the LARGEST DurDef whose div is ≤ the requested amount.
// snapDur picks CLOSEST which can round UP and overshoot the available space,
// causing the note to consume more MusicXML time than it should — the next
// note then gets written at a later position than intended, drifting the
// sheet timing.  snapDurDown guarantees no overshoot.
function snapDurDown(divs: number): DurDef {
  for (const d of DUR_TABLE) {           // DUR_TABLE is sorted by div descending
    if (d.div <= divs) return d
  }
  return DUR_TABLE[DUR_TABLE.length - 1] // smallest (64th)
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
export function midiToMusicXml(
  notes: MidiNote[],
  bpm: number,
  ts: { numerator: number; denominator: number },
  activeHands: Hand[]
): string {
  const bpm_     = Math.max(1, bpm)
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
    const positions = [...cm.entries()].sort((a, b) => a[0] - b[0])
    let xml = '', cur = 0
    for (let i = 0; i < positions.length; i++) {
      const [pos, chord] = positions[i]
      if (pos > cur) { xml += fillRests(pos - cur, staff, voice); cur = pos }
      // Clamp duration so the note NEVER overshoots the next chord's start.
      const nextPos = i + 1 < positions.length ? positions[i + 1][0] : divsPerM
      const maxDur  = Math.min(chord[0].dur.div, nextPos - pos)
      const act     = snapDurDown(Math.max(1, maxDur))
      chord.forEach((n, j) => { xml += noteEl(midiPitch(n.midi), act, staff, voice, j > 0) })
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
