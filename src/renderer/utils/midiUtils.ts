import { Midi } from '@tonejs/midi'
import type { MidiFileData, MidiNote, Hand } from '../types'
import { PIANO_MIN, PIANO_MAX, midiToNoteName } from './noteUtils'

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
        channel: note.channel ?? 0,
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
  }
}

export function filterNotesByMode(
  notes: MidiNote[],
  hands: ('left' | 'right')[],
): MidiNote[] {
  return notes.filter((n) => hands.includes(n.hand as 'left' | 'right') || n.hand === 'unknown')
}
