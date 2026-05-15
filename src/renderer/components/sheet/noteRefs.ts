// ─── Per-note timing + VexFlow DOM id refs ──────────────────────────────────
// One entry per drawn notehead in the OSMD score.  SheetMusic builds this
// table once when the sheet renders and uses it for the highlight effect:
// time + staff lookups against currentTimeRef pick the correct DOM nodes to
// colour, without any per-frame DOM querying.

import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

export interface NoteRef {
  timeInSeconds: number
  durSeconds:    number
  svgId:         string
  isRight:       boolean   // treble = right hand (staff index 0 in MeasureList)
  isBlack:       boolean   // sharp / flat — black piano key
  midi:          number    // OSMD halfTone + 12 (kept for diagnostics; NOT used
                           // for matching, see notes in SheetMusic.tsx)
}

// Pitch classes for the black piano keys: C#, D#, F#, G#, A#.
const BLACK_PCS = new Set([1, 3, 6, 8, 10])

/**
 * Walk the OSMD GraphicSheet measure list and produce a flat, time-sorted
 * NoteRef array.  The same source note can appear in MeasureList more than
 * once across system breaks; we dedupe by `getSVGId()` so each DOM node only
 * shows up once.  OSMD emits staff-0 entries then staff-1 entries per row,
 * so a final sort by time keeps treble + bass note refs interleaved in true
 * timeline order.
 */
export function collectNoteRefs(osmd: OpenSheetMusicDisplay, bpm: number): NoteRef[] {
  const bpm_ = Math.max(1, bpm)
  const refs: NoteRef[] = []
  const seen = new Set<string>()

  try {
    for (const row of osmd.GraphicSheet.MeasureList) {
      for (let staffIdx = 0; staffIdx < row.length; staffIdx++) {
        const measure = row[staffIdx]
        if (!measure) continue
        const isRight = (staffIdx === 0)   // treble = staff 0 = right hand
        const mWN = (measure as any).parentSourceMeasure?.AbsoluteTimestamp?.RealValue ?? 0

        for (const entry of (measure as any).staffEntries ?? []) {
          const eWN = entry.relInMeasureTimestamp?.RealValue ?? 0
          const timeInSeconds = (mWN + eWN) * 4 * 60 / bpm_

          for (const gve of entry.graphicalVoiceEntries ?? []) {
            for (const gnote of gve.notes ?? []) {
              if (gnote.sourceNote?.Pitch == null) continue
              try {
                const svgId = (gnote as any).getSVGId?.() as string | null | undefined
                if (!svgId || seen.has(svgId)) continue
                seen.add(svgId)

                // halfTone % 12 yields the pitch class (0=C … 11=B).  This is
                // the unaltered pitch — key-signature accidentals are NOT
                // reflected here, which is why we deliberately don't use the
                // resulting midi value for matching downstream.
                const halfTone: number = (gnote.sourceNote?.Pitch?.halfTone ?? 0)
                const isBlack = BLACK_PCS.has(((halfTone % 12) + 12) % 12)
                const midi    = halfTone + 12   // OSMD C0=0 ⇒ MIDI C-1=0 offset +12

                const durWN = gnote.sourceNote?.Length?.RealValue ?? 0.25
                refs.push({
                  timeInSeconds,
                  durSeconds: Math.max(0.05, durWN * 4 * 60 / bpm_),
                  svgId,
                  isRight,
                  isBlack,
                  midi,
                })
              } catch { /* ignore individual note errors */ }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[sheet] collectNoteRefs:', e)
  }

  refs.sort((a, b) => a.timeInSeconds - b.timeInSeconds)
  return refs
}

// ─── Binary search helpers ────────────────────────────────────────────────────
/** Greatest index i with steps[i] ≤ t; 0 if `steps` is empty. */
export function bsearchStep(steps: number[], t: number): number {
  if (!steps.length) return 0
  let lo = 0, hi = steps.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (steps[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** First index i where refs[i].timeInSeconds ≥ target. */
export function lowerBoundRefs(refs: NoteRef[], target: number): number {
  let lo = 0, hi = refs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (refs[mid].timeInSeconds < target) lo = mid + 1
    else hi = mid
  }
  return lo
}
