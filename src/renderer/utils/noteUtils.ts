// ─── Piano key geometry + naming ─────────────────────────────────────────────
// 88-key piano spans MIDI A0 (21) to C8 (108).  This module owns the static
// lookup tables that PianoKeyboard / FallingNotes use to position keys and
// label them, plus the small isBlackKey / midiToNoteName helpers.

export const PIANO_MIN = 21   // A0
export const PIANO_MAX = 108  // C8

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[midi % 12]}${octave}`
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}

// ─── White key index lookup ───────────────────────────────────────────────────
const whiteKeyIndex     = new Array(PIANO_MAX + 1).fill(-1)
const blackKeyLeftWhite = new Array(PIANO_MAX + 1).fill(-1)

let wIdx = 0
for (let m = PIANO_MIN; m <= PIANO_MAX; m++) {
  if (!isBlackKey(m)) whiteKeyIndex[m] = wIdx++
}
/** Total white keys on the 88-key piano = 52. */
export const TOTAL_WHITE_KEYS = wIdx

for (let m = PIANO_MIN; m <= PIANO_MAX; m++) {
  if (isBlackKey(m)) {
    let left = m - 1
    while (left >= PIANO_MIN && isBlackKey(left)) left--
    blackKeyLeftWhite[m] = left >= PIANO_MIN ? whiteKeyIndex[left] : 0
  }
}

export function getWhiteKeyIndex(midi: number): number {
  return whiteKeyIndex[midi] ?? -1
}

/** X centre as a fraction [0, 1] of the total keyboard width, for black keys
 *  only.  Positioned 70 % into the left-adjacent white key — visually matches
 *  how a real piano lays out the black keys between their white neighbours. */
export function getBlackKeyFraction(midi: number): number {
  const leftIdx = blackKeyLeftWhite[midi]
  return (leftIdx + 0.70) / TOTAL_WHITE_KEYS
}
