// Render the recording's audible window to a peaks Float32Array.  Re-runs
// whenever the audible data changes (notes / clips / duration).  Each
// emitted Float32Array is reference-fresh so the canvas renderer paints
// the new values.

import { useEffect, useState } from 'react'
import type { Clip, RecordedNote } from '@/freeMode'
import { bufferToPeaks, emptyPeaks, renderNotesToBuffer } from '@/freeMode'

export interface WaveformPeaks {
  peaks:     Float32Array
  rendering: boolean
}

export function useWaveformPeaks(
  notes: RecordedNote[],
  clips: Clip[],
  durationMs: number,
): WaveformPeaks {
  const [peaks, setPeaks] = useState<Float32Array>(() => emptyPeaks(durationMs))
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (durationMs <= 0 || notes.length === 0) {
      setPeaks(emptyPeaks(durationMs))
      setRendering(false)
      return
    }
    setRendering(true)
    renderNotesToBuffer(notes, clips, durationMs).then((buf) => {
      if (cancelled) return
      setPeaks(buf ? bufferToPeaks(buf) : emptyPeaks(durationMs))
      setRendering(false)
    }).catch(() => {
      if (cancelled) return
      setPeaks(emptyPeaks(durationMs))
      setRendering(false)
    })
    return () => { cancelled = true }
  }, [notes, clips, durationMs])

  return { peaks, rendering }
}
