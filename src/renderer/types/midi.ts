// ─── MIDI domain types ──────────────────────────────────────────────────────
// Everything we know about a parsed MIDI file and the individual notes
// inside it.  Produced by utils/midiUtils.parseMidiBuffer and consumed
// throughout the renderer.

/** Which hand a note belongs to.  'unknown' is used when the source MIDI
 *  has no track convention we recognise — the renderer falls back to a
 *  generic colour scheme for those. */
export type Hand = 'left' | 'right' | 'unknown'

/** One note event in a parsed MIDI file. */
export interface MidiNote {
  id:       string    // unique within the file — used as React key
  midi:     number    // MIDI note number, 0–127
  time:     number    // seconds from song start
  duration: number    // held duration in seconds
  velocity: number    // 0–1
  name:     string    // e.g. "C4"
  track:    number    // index into MidiFileData.notes' source tracks
  hand:     Hand
  channel:  number
}

/** One sustain-pedal (MIDI CC64) edge.  `down` true = pedal pressed. */
export interface PedalEvent {
  time: number    // seconds from song start
  down: boolean
}

/** A fully parsed MIDI file, ready for playback / display. */
export interface MidiFileData {
  name:          string
  duration:      number   // seconds — total song length
  bpm:           number   // original BPM from the file header
  timeSignature: { numerator: number; denominator: number }
  notes:         MidiNote[]
  trackCount:    number
  // Sustain-pedal timeline (CC64), time-sorted.  Absent / empty when the
  // file carries no pedal data — playback then uses raw note durations.
  pedalEvents?:  PedalEvent[]
}
