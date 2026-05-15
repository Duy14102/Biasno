import type { MidiNote, NoteVisualState } from '../types'

/** Per-note runtime state held by PracticePage.  Mirrors a MidiNote with
 *  three extra fields the playback engine mutates as the song progresses. */
export interface NoteState {
  note:       MidiNote
  visual:     NoteVisualState
  flashAlpha: number     // 0..1 — drives FallingNotes' onset flash
  scheduled:  boolean    // already enqueued in the audio engine?
}

/** Round a free-form resume time back to the nearest preceding note onset.
 *  Used when restoring a bookmark — landing slightly before the note feels
 *  more natural than mid-note. */
export function findBestResumeTime(notes: MidiNote[], t: number): number {
  let best = 0
  for (const note of notes) {
    if (note.time <= t && note.time > best) best = note.time
  }
  return best
}
