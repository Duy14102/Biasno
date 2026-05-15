// ─── Practice-mode domain types ─────────────────────────────────────────────
// Modes the user can pick from the mode page, plus the settings bundle that
// ModePage hands off to PracticePage.

import type { MidiFileData } from './midi'

/** The ten practice modes.  view-listen = auto-playback no input required;
 *  the rest are 3 hand selections × 3 skill selections (melody / rhythm /
 *  both).  Tracked as a literal-union string so it serialises cleanly as a
 *  resume-bookmark key and a per-(song, mode) prefs key. */
export type PracticeMode =
  | 'view-listen'           // Xem và nghe
  | 'left-melody'           // Tập tay trái (melody)
  | 'right-melody'          // Tập tay phải (melody)
  | 'both-melody'           // Tập cả 2 tay (melody)
  | 'left-rhythm'           // Tập tay trái (rhythm)
  | 'right-rhythm'          // Tập tay phải (rhythm)
  | 'both-rhythm'           // Tập cả 2 tay (rhythm)
  | 'left-melody-rhythm'    // Tập tay trái (melody + rhythm)
  | 'right-melody-rhythm'   // Tập tay phải (melody + rhythm)
  | 'both-melody-rhythm'    // Tập cả 2 tay (melody + rhythm)

/** Payload handed from ModePage → PracticePage when the user picks a mode. */
export interface PracticeSettings {
  mode:     PracticeMode
  midiFile: MidiFileData
}
