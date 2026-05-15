// ─── Visual / playback-state types ──────────────────────────────────────────
// Types about what the renderer is doing with a note at any moment, plus the
// loop-region selection on the progress bar.

import type { MidiNote } from './midi'

/** Per-note visual state as it travels through playback.
 *
 *   pending  — note hasn't been reached yet
 *   active   — note is at the hit line, waiting for input (practice mode)
 *   holding  — player is actively holding the correct key down
 *   hit      — confirmed successful (green flash)
 *   missed   — note end passed without a correct hold (red flash)
 *   playing  — view-listen mode shows the note as currently sounding
 */
export type NoteVisualState = 'pending' | 'active' | 'holding' | 'hit' | 'missed' | 'playing'

/** A MidiNote plus its current visual state.  Used by FallingNotes' render
 *  list to decide colour + glow + flash for each frame. */
export interface VisualNote extends MidiNote {
  state: NoteVisualState
}

/** User-defined loop region on the progress bar.  Both fractions of the
 *  song's total duration, so 0 = start, 1 = end. */
export interface LoopRegion {
  start: number   // 0.0 – 1.0
  end:   number   // 0.0 – 1.0
}
