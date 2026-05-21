export const PIANO_MIN = 21
export const PIANO_MAX = 108

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[midi % 12]}${octave}`
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}

const whiteKeyIndex     = new Array(PIANO_MAX + 1).fill(-1)
const blackKeyLeftWhite = new Array(PIANO_MAX + 1).fill(-1)

let wIdx = 0
for (let m = PIANO_MIN; m <= PIANO_MAX; m++) {
  if (!isBlackKey(m)) whiteKeyIndex[m] = wIdx++
}

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

export function getBlackKeyLeftWhite(midi: number): number {
  return blackKeyLeftWhite[midi]
}

export type KeyCount = 88 | 76 | 61
export const KEY_COUNTS: KeyCount[] = [88, 76, 61]

export interface PianoRange {
  min:         number
  max:         number
  whiteOffset: number
  totalWhite:  number
}

function buildRange(min: number, max: number): PianoRange {
  const whiteOffset = whiteKeyIndex[min]
  let totalWhite = 0
  for (let m = min; m <= max; m++) if (!isBlackKey(m)) totalWhite++
  return { min, max, whiteOffset, totalWhite }
}

export const PIANO_RANGES: Record<KeyCount, PianoRange> = {
  88: buildRange(21, 108),
  76: buildRange(28, 103),
  61: buildRange(36, 96),
}

export function detectKeyCountFromName(name: string | null | undefined): KeyCount {
  if (!name) return 88
  if (/\b88\b/.test(name)) return 88
  if (/\b76\b/.test(name)) return 76
  if (/\b61\b/.test(name)) return 61
  return 88
}
