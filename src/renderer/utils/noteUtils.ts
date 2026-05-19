// ─── Piano key geometry + naming ─────────────────────────────────────────────
// Lookup tables are built once for the full 88-key range (A0..C8).  Smaller
// keyboard variants (76 / 61) are sub-ranges of that table — components map
// absolute white-key indices to local positions by subtracting `whiteOffset`
// and dividing by the range's own `totalWhite`.

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

/** Absolute white-key index (on the 88-key grid) of the left neighbour of a
 *  black key.  Exposed so range-aware components can recompute the black-key
 *  fraction relative to a sub-range's origin. */
export function getBlackKeyLeftWhite(midi: number): number {
  return blackKeyLeftWhite[midi]
}

// ─── Key-count variants ──────────────────────────────────────────────────────
// Standard piano sizes: 88 (A0–C8), 76 (E1–G7), 61 (C2–C7).
export type KeyCount = 88 | 76 | 61
export const KEY_COUNTS: KeyCount[] = [88, 76, 61]

export interface PianoRange {
  min:         number  // lowest MIDI in the range
  max:         number  // highest MIDI in the range
  whiteOffset: number  // absolute white-key index of `min` (origin shift)
  totalWhite:  number  // white keys in this range
}

function buildRange(min: number, max: number): PianoRange {
  const whiteOffset = whiteKeyIndex[min]
  let totalWhite = 0
  for (let m = min; m <= max; m++) if (!isBlackKey(m)) totalWhite++
  return { min, max, whiteOffset, totalWhite }
}

export const PIANO_RANGES: Record<KeyCount, PianoRange> = {
  88: buildRange(21, 108),  // A0 → C8
  76: buildRange(28, 103),  // E1 → G7
  61: buildRange(36, 96),   // C2 → C7
}

/** Best-effort key-count detection from a MIDI device's name string.  Looks
 *  for "88" / "76" / "61" tokens; falls back to 88 when nothing matches.
 *  Reliable for any device that puts the size in its model name. */
export function detectKeyCountFromName(name: string | null | undefined): KeyCount {
  if (!name) return 88
  if (/\b88\b/.test(name)) return 88
  if (/\b76\b/.test(name)) return 76
  if (/\b61\b/.test(name)) return 61
  return 88
}
