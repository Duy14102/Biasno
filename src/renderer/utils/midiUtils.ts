import { Midi } from '@tonejs/midi'
import type { MidiFileData, MidiNote, PedalEvent, Hand } from '@/types'
import { PIANO_MIN, PIANO_MAX, midiToNoteName } from './noteUtils'

// Merge every track's CC64 (sustain pedal) into one time-sorted timeline.
// @tonejs/midi normalises CC values to 0–1, so down = value ≥ 0.5.  Consecutive
// edges of the same state are collapsed so the timeline only carries real
// transitions (multiple tracks often duplicate the pedal line).
function extractPedalEvents(midi: Midi): PedalEvent[] {
  const raw: PedalEvent[] = []
  midi.tracks.forEach((track) => {
    const cc64 = track.controlChanges[64]
    if (!cc64) return
    cc64.forEach((cc) => raw.push({ time: cc.time, down: cc.value >= 0.5 }))
  })
  raw.sort((a, b) => a.time - b.time)
  const out: PedalEvent[] = []
  for (const e of raw) {
    const last = out[out.length - 1]
    if (last && last.down === e.down) continue
    out.push(e)
  }
  return out
}

export async function parseMidiBuffer(buffer: ArrayBuffer, fileName: string): Promise<MidiFileData> {
  const midi = new Midi(buffer)

  const allNotes: MidiNote[] = []
  let noteId = 0

  midi.tracks.forEach((track, trackIndex) => {
    if (track.notes.length === 0) return

    let hand: Hand
    if (midi.tracks.length >= 2) {
      hand = trackIndex === 0 ? 'right' : trackIndex === 1 ? 'left' : 'unknown'
    } else {
      hand = 'unknown'
    }

    track.notes.forEach((note) => {
      if (note.midi < PIANO_MIN || note.midi > PIANO_MAX) return

      const resolvedHand: Hand =
        hand === 'unknown'
          ? note.midi < 60 ? 'left' : 'right'
          : hand

      allNotes.push({
        id: `n${noteId++}`,
        midi: note.midi,
        time: note.time,
        duration: Math.max(note.duration, 0.05),
        velocity: note.velocity,
        name: note.name || midiToNoteName(note.midi),
        track: trackIndex,
        hand: resolvedHand,
        channel: track.channel ?? 0,
      })
    })
  })

  allNotes.sort((a, b) => a.time - b.time || a.midi - b.midi)

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
  const ts = midi.header.timeSignatures[0]
  const timeSignature = ts
    ? { numerator: ts.timeSignature[0], denominator: ts.timeSignature[1] }
    : { numerator: 4, denominator: 4 }

  return {
    name: fileName,
    duration: midi.duration,
    bpm,
    timeSignature,
    notes: allNotes,
    trackCount: midi.tracks.length,
    pedalEvents: extractPedalEvents(midi),
  }
}

export function filterNotesByMode(
  notes: MidiNote[],
  hands: ('left' | 'right')[],
): MidiNote[] {
  return notes.filter((n) => hands.includes(n.hand as 'left' | 'right') || n.hand === 'unknown')
}
