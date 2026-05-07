export const PIANO_MIN = 21   // A0
export const PIANO_MAX = 108  // C8
export const TOTAL_KEYS = PIANO_MAX - PIANO_MIN + 1  // 88

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[midi % 12]}${octave}`
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}

// ─── White key index lookup ───────────────────────────────────────────────────
const whiteKeyIndex = new Array(PIANO_MAX + 1).fill(-1)
const blackKeyLeftWhite = new Array(PIANO_MAX + 1).fill(-1)

let wIdx = 0
for (let m = PIANO_MIN; m <= PIANO_MAX; m++) {
  if (!isBlackKey(m)) whiteKeyIndex[m] = wIdx++
}
export const TOTAL_WHITE_KEYS = wIdx  // 52

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

/** X center as fraction [0,1] of total keyboard width (for black keys) */
export function getBlackKeyFraction(midi: number): number {
  const leftIdx = blackKeyLeftWhite[midi]
  // Position: 70% into the left white key
  return (leftIdx + 0.70) / TOTAL_WHITE_KEYS
}

/** X center fraction for any note */
export function getNoteXFraction(midi: number): number {
  if (!isBlackKey(midi)) return (whiteKeyIndex[midi] + 0.5) / TOTAL_WHITE_KEYS
  return getBlackKeyFraction(midi)
}

// ─── Colors ───────────────────────────────────────────────────────────────────
// Right hand = vivid blue, Left hand = vivid orange
export const HAND_COLORS = {
  right: {
    normal: '#4488ff',
    glow:   '#77aaff',
    hit:    '#44ee88',
    miss:   '#ff4455'
  },
  left: {
    normal: '#ff8833',
    glow:   '#ffaa66',
    hit:    '#44ee88',
    miss:   '#ff4455'
  },
  unknown: {
    normal: '#88aacc',
    glow:   '#aaccee',
    hit:    '#44ee88',
    miss:   '#ff4455'
  }
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
