// Canvas2D waveform renderer.  Each clip gets:
//   1. Its bars painted within its ms range — NOT geometrically clipped,
//      so tall attack peaks aren't shaved off by a rounded corner.  Bars
//      are painted in ONE consistent violet regardless of selection or
//      lock state — the recorded wave never changes appearance because
//      of a UI state change.  Splitting a clip (which assigns new ids
//      and drops the previous selection) therefore can't make the wave
//      look different.
//   2. A rounded-rect stroke outline drawn ON TOP of the bars.  The
//      outline IS where state lives: cyan when selected, amber when
//      locked, neutral otherwise.  This is also the only border the
//      user sees — the outer track border is removed so each clip reads
//      as its own rounded container, separated by a clean gap at the
//      cut.

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Clip, RecordedNote } from '@/freeMode'
import { useWaveformPeaks } from './useWaveformPeaks'

interface Props {
  notes:        RecordedNote[]
  clips:        Clip[]
  durationMs:   number
  selectedClipId: number | string | null
  onSeek?:      (ms: number) => void
}

const BAR_WIDTH_PX        = 2
const BAR_GAP_PX          = 1
const MIN_BAR_HEIGHT_PX   = 1
const CLIP_RADIUS_PX      = 8
// Matches ClipOverlay's `width: calc(% - 2px)`.  1 px on each side gives a
// 2 px visible slit between touching clips at the split point.
const CLIP_INSET_PX       = 1
// Outline lives half-a-pixel inside so the 1 px stroke renders crisply.
const OUTLINE_INSET_PX    = 0.5

export default function TimelineWaveform({
  notes, clips, durationMs, selectedClipId, onSeek,
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)

  const { peaks } = useWaveformPeaks(notes, clips, durationMs)

  const paint = useCallback(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const cssWidth  = container.clientWidth
    const cssHeight = container.clientHeight
    if (cssWidth <= 0 || cssHeight <= 0) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width  = cssWidth  * dpr
      canvas.height = cssHeight * dpr
      canvas.style.width  = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssWidth, cssHeight)

    if (peaks.length === 0 || clips.length === 0 || durationMs <= 0) return

    // Normalise to the GLOBAL peak so bar heights are comparable across
    // clips — cutting a sustained note doesn't visually rescale the rest
    // of the wave.
    let peakMax = 0
    for (let i = 0; i < peaks.length; i++) {
      const v = peaks[i]
      if (v > peakMax) peakMax = v
    }
    if (peakMax <= 0) return
    const scale = (cssHeight * 0.9) / peakMax

    const halfHeight = cssHeight / 2
    const stepPx     = BAR_WIDTH_PX + BAR_GAP_PX
    const barCount   = Math.max(1, Math.floor(cssWidth / stepPx))

    // Precompute every bar (position + height + ms) once.
    type Bar = { x: number; h: number; centreMs: number }
    const bars: Bar[] = []
    for (let i = 0; i < barCount; i++) {
      const x = i * stepPx
      const sampleIdx = Math.floor((i / barCount) * peaks.length)
      const v = peaks[Math.min(sampleIdx, peaks.length - 1)] ?? 0
      const h = Math.max(MIN_BAR_HEIGHT_PX, v * scale)
      const centreMs = ((x + BAR_WIDTH_PX / 2) / cssWidth) * durationMs
      bars.push({ x, h, centreMs })
    }

    // Two passes per clip: bars first, outline on top.
    for (const c of clips) {
      const leftPx  = (c.startMs / durationMs) * cssWidth
      const rightPx = (c.endMs   / durationMs) * cssWidth
      const widthPx = rightPx - leftPx
      if (widthPx <= 0) continue

      const clipX = leftPx + CLIP_INSET_PX
      const clipW = widthPx - CLIP_INSET_PX * 2
      if (clipW <= 0) continue

      const isSelected = c.id === selectedClipId
      const isLocked   = c.locked

      // Bars — ONE colour for every clip.  Selection / lock state live
      // exclusively on the outline below, so the recorded wave never
      // changes shape or tint because of a transient UI state.
      ctx.fillStyle = 'rgba(167, 139, 250, 0.90)'  // violet

      for (const b of bars) {
        if (b.centreMs < c.startMs || b.centreMs > c.endMs) continue
        ctx.fillRect(b.x, halfHeight - b.h / 2, BAR_WIDTH_PX, b.h)
      }

      // Outline — rounded rectangle on top of bars (the train-car border).
      // This is where selected / locked state is communicated.
      ctx.strokeStyle = isSelected
        ? 'rgba(103, 232, 249, 0.85)'           // cyan
        : isLocked
          ? 'rgba(251, 191, 36, 0.70)'          // amber
          : 'rgba(148, 163, 184, 0.45)'         // slate — subtle
      ctx.lineWidth = isSelected ? 1.5 : 1
      ctx.beginPath()
      const outlineX = clipX + OUTLINE_INSET_PX
      const outlineW = clipW - OUTLINE_INSET_PX * 2
      const outlineY = OUTLINE_INSET_PX
      const outlineH = cssHeight - OUTLINE_INSET_PX * 2
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(outlineX, outlineY, outlineW, outlineH, CLIP_RADIUS_PX)
      } else {
        ctx.rect(outlineX, outlineY, outlineW, outlineH)
      }
      ctx.stroke()
    }
  }, [peaks, clips, durationMs, selectedClipId])

  useLayoutEffect(() => { paint() }, [paint])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => paint())
    ro.observe(el)
    return () => ro.disconnect()
  }, [paint])

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    onSeek(Math.round(ratio * durationMs))
  }, [onSeek, durationMs])

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className="absolute inset-x-0 top-1 bottom-1 z-[2] cursor-pointer"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
