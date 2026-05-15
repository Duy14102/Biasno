import { Midi } from '@tonejs/midi'
import type { MidiFileData, MidiNote, Hand } from '../types'
import { PIANO_MIN, PIANO_MAX, midiToNoteName } from './noteUtils'

function detectHandByRange(avgMidi: number): Hand {
  if (avgMidi < 60) return 'left'
  return 'right'
}

export async function parseMidiBuffer(buffer: ArrayBuffer, fileName: string): Promise<MidiFileData> {
  const midi = new Midi(buffer)

  const allNotes: MidiNote[] = []
  let noteId = 0

  midi.tracks.forEach((track, trackIndex) => {
    if (track.notes.length === 0) return

    // Determine hand: multi-track MIDI uses track 0=right, track 1=left by convention
    let hand: Hand
    if (midi.tracks.length >= 2) {
      hand = trackIndex === 0 ? 'right' : trackIndex === 1 ? 'left' : 'unknown'
    } else {
      // Single-track: split by pitch at middle C (60)
      hand = 'unknown'
    }

    track.notes.forEach((note) => {
      const midi_num = note.midi
      if (midi_num < PIANO_MIN || midi_num > PIANO_MAX) return  // outside 88 keys

      const resolvedHand: Hand =
        hand === 'unknown'
          ? note.midi < 60 ? 'left' : 'right'
          : hand

      allNotes.push({
        id: `n${noteId++}`,
        midi: midi_num,
        time: note.time,
        duration: Math.max(note.duration, 0.05),
        velocity: note.velocity,
        name: note.name || midiToNoteName(midi_num),
        track: trackIndex,
        hand: resolvedHand,
        channel: note.channel ?? 0
      })
    })
  })

  // Sort by time
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
    trackCount: midi.tracks.length
  }
}

/** Filter notes by mode (which hands to include) */
export function filterNotesByMode(
  notes: MidiNote[],
  hands: ('left' | 'right')[]
): MidiNote[] {
  return notes.filter((n) => hands.includes(n.hand as 'left' | 'right') || n.hand === 'unknown')
}

/** Determine which hands the player needs to play based on mode */
export function getActiveHands(mode: string): ('left' | 'right')[] {
  if (mode.startsWith('left')) return ['left']
  if (mode.startsWith('right')) return ['right']
  if (mode.startsWith('both') || mode === 'view-listen') return ['left', 'right']
  return ['left', 'right']
}

/** Does mode require melody accuracy (correct note) */
export function requiresMelody(mode: string): boolean {
  return mode.includes('melody') || mode === 'view-listen'
}

/** Does mode require rhythm accuracy (correct timing) */
export function requiresRhythm(mode: string): boolean {
  return mode.includes('rhythm') || mode === 'view-listen'
}
