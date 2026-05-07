// ─── Practice Modes ───────────────────────────────────────────────────────────
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

// ─── Hand ─────────────────────────────────────────────────────────────────────
export type Hand = 'left' | 'right' | 'unknown'

// ─── MIDI Note ────────────────────────────────────────────────────────────────
export interface MidiNote {
  id: string          // unique id per note
  midi: number        // MIDI note number 0-127
  time: number        // seconds from song start
  duration: number    // held duration in seconds
  velocity: number    // 0-1
  name: string        // e.g. "C4"
  track: number       // track index in the MIDI file
  hand: Hand
  channel: number
}

// ─── Parsed MIDI File ─────────────────────────────────────────────────────────
export interface MidiFileData {
  name: string
  duration: number      // total song duration in seconds
  bpm: number           // original BPM from file
  timeSignature: { numerator: number; denominator: number }
  notes: MidiNote[]
  trackCount: number
}

// ─── Loop Region (0–1 fractions of song duration) ────────────────────────────
export interface LoopRegion {
  start: number   // 0.0–1.0
  end: number     // 0.0–1.0
}

// ─── Practice Settings (passed from ModePage → PracticePage) ─────────────────
export interface PracticeSettings {
  mode: PracticeMode
  midiFile: MidiFileData
}

// ─── Visual Note State ────────────────────────────────────────────────────────
export type NoteVisualState = 'pending' | 'active' | 'holding' | 'hit' | 'missed' | 'playing'

export interface VisualNote extends MidiNote {
  state: NoteVisualState
}

// ─── MIDI Device ──────────────────────────────────────────────────────────────
export interface MidiDevice {
  id: string
  name: string
  type: 'input' | 'output'
}
