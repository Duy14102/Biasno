import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

export interface NoteRef {
  timeInSeconds: number
  durSeconds:    number
  svgId:         string
  isRight:       boolean
  isBlack:       boolean
  midi:          number
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10])

// OSMD's internal types (parentSourceMeasure, staffEntries, graphicalVoiceEntries,
// getSVGId) are not surfaced on its public TypeScript surface. We narrow access
// to the shapes we use rather than reaching for `any`.
interface OsmdMeasureLike {
  parentSourceMeasure?: { AbsoluteTimestamp?: { RealValue: number } }
  staffEntries?: OsmdStaffEntry[]
}
interface OsmdStaffEntry {
  relInMeasureTimestamp?: { RealValue: number }
  graphicalVoiceEntries?: OsmdVoiceEntry[]
}
interface OsmdVoiceEntry {
  notes?: OsmdGNote[]
}
interface OsmdGNote {
  sourceNote?: {
    Pitch?: { halfTone?: number } | null
    Length?: { RealValue?: number }
  }
  getSVGId?: () => string | null | undefined
}

export function collectNoteRefs(osmd: OpenSheetMusicDisplay, bpm: number): NoteRef[] {
  const bpm_ = Math.max(1, bpm)
  const refs: NoteRef[] = []
  const seen = new Set<string>()

  try {
    for (const row of osmd.GraphicSheet.MeasureList) {
      for (let staffIdx = 0; staffIdx < row.length; staffIdx++) {
        const measure = row[staffIdx] as unknown as OsmdMeasureLike | null
        if (!measure) continue
        const isRight = (staffIdx === 0)
        const mWN = measure.parentSourceMeasure?.AbsoluteTimestamp?.RealValue ?? 0

        for (const entry of measure.staffEntries ?? []) {
          const eWN = entry.relInMeasureTimestamp?.RealValue ?? 0
          const timeInSeconds = (mWN + eWN) * 4 * 60 / bpm_

          for (const gve of entry.graphicalVoiceEntries ?? []) {
            for (const gnote of gve.notes ?? []) {
              if (gnote.sourceNote?.Pitch == null) continue
              try {
                const svgId = gnote.getSVGId?.()
                if (!svgId || seen.has(svgId)) continue
                seen.add(svgId)

                const halfTone: number = gnote.sourceNote?.Pitch?.halfTone ?? 0
                const isBlack = BLACK_PCS.has(((halfTone % 12) + 12) % 12)
                const midi    = halfTone + 12

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

export function lowerBoundRefs(refs: NoteRef[], target: number): number {
  let lo = 0, hi = refs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (refs[mid].timeInSeconds < target) lo = mid + 1
    else hi = mid
  }
  return lo
}
