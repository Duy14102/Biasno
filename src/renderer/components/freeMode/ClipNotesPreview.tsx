// Canvas2D piano-roll preview rendered directly from RecordedNote data —
// no synthesised audio, no peaks, no envelope phase.  Each note is one
// rounded rectangle: X = time within the timeline, Y = MIDI pitch (auto-
// fit to the recording's pitch range), width = duration, hue = velocity
// (violet → fuchsia gradient matching the app's brand gradient).
//
// Notes are drawn at the TIMELINE level, not per-clip — a sustained note
// whose onset is in one clip extends visually across every touching clip
// it sounds through (audible end = chunkEndAt, which mirrors the playback
// engine).  Per-clip bodies + outlines are painted underneath / on top,
// so split keeps the note visually continuous while the clip cards still
// read as distinct containers.
//
// Selection / lock state lives ONLY on the rounded outline drawn over
// the clip — the notes themselves never change appearance from a UI
// state change, so split / delete / select can never visually distort
// the preview.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { Clip, RecordedNote } from '@/freeMode'
import { chunkEndAt } from '@/freeMode'
import { isBlackKey, HAND_COLORS, handColorKey } from '@/utils'

interface Props {
  notes:          RecordedNote[]
  clips:          Clip[]
  durationMs:     number
  selectedClipId: number | string | null
  onSeek?:        (ms: number) => void
  showMeasureLines?: boolean
}

const NOTE_RADIUS_PX     = 2
const NOTE_MIN_WIDTH_PX  = 2
const CLIP_RADIUS_PX     = 8
const CLIP_INSET_PX      = 1
const OUTLINE_INSET_PX   = 0.5
const PITCH_PAD          = 2
const MIN_PITCH_SPAN     = 8

function pitchRange(notes: RecordedNote[]): { lo: number; hi: number } {
  if (notes.length === 0) return { lo: 60, hi: 72 }
  let lo = Infinity, hi = -Infinity
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi
    if (n.midi > hi) hi = n.midi
  }
  while (hi - lo < MIN_PITCH_SPAN) {
    if (lo > 0)   lo--
    if (hi < 127) hi++
  }
  return { lo: Math.max(0, lo - PITCH_PAD), hi: Math.min(127, hi + PITCH_PAD) }
}

// Hand-coloured note fills — pulled from the shared 4-colour palette so
// the same MIDI note reads identically here, on the keyboard, the falling
// notes, and the sheet.  Velocity modulates alpha so soft taps render
// softer without breaking the hand identity.
function noteFill(midi: number, velocity: number): string {
  const v    = Math.max(0, Math.min(1, velocity))
  const hand = midi >= 60 ? 'right' : 'left'
  const c    = HAND_COLORS[handColorKey(midi, hand, isBlackKey(midi))]
  const alpha = Math.round((0.78 + 0.18 * v) * 255).toString(16).padStart(2, '0')
  return c.fill + alpha
}

export default function ClipNotesPreview({
  notes, clips, durationMs, selectedClipId, onSeek, showMeasureLines = false,
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const range = useMemo(() => pitchRange(notes), [notes])

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
    if (clips.length === 0 || durationMs <= 0) return

    const span         = Math.max(1, range.hi - range.lo)
    const usableHeight = cssHeight - 8
    const noteHeight   = Math.max(3, Math.min(8, Math.floor(usableHeight / Math.max(8, span + 2))))
    const yOf = (midi: number) =>
      4 + (1 - (midi - range.lo) / span) * usableHeight

    const xOf = (ms: number) => (ms / durationMs) * cssWidth

    // ── Pass 1: clip body tints (under everything else). ────────────────
    for (const c of clips) {
      const leftPx  = xOf(c.startMs)
      const widthPx = xOf(c.endMs) - leftPx
      if (widthPx <= 0) continue
      const clipX = leftPx + CLIP_INSET_PX
      const clipW = widthPx - CLIP_INSET_PX * 2
      if (clipW <= 0) continue
      ctx.fillStyle = 'rgba(99, 102, 241, 0.10)'
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath()
        ctx.roundRect(clipX, OUTLINE_INSET_PX, clipW, cssHeight - OUTLINE_INSET_PX * 2, CLIP_RADIUS_PX)
        ctx.fill()
      } else {
        ctx.fillRect(clipX, 0, clipW, cssHeight)
      }
    }

    // ── Pass 1b: optional piano-roll guide.  Two layers, both subtle:
    //   • Black-key rows get a thin shaded band (no per-pitch lines — the
    //     bands themselves read as the grid).
    //   • Every C gets a slightly stronger separator + tiny "C{n}" label,
    //     giving the eye an octave anchor without a forest of lines.
    if (showMeasureLines) {
      const rowH = usableHeight / span
      // (a) black-key row tints
      for (let m = range.lo; m <= range.hi; m++) {
        if (!isBlackKey(m)) continue
        const yc = yOf(m)
        const top = yc - rowH / 2
        ctx.fillStyle = 'rgba(15, 23, 42, 0.18)'   // slate-900 @ 18%
        ctx.fillRect(0, top, cssWidth, rowH)
      }
      // (b) octave separator at the bottom edge of each C row + label
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textBaseline = 'middle'
      for (let m = range.lo; m <= range.hi; m++) {
        if (m % 12 !== 0) continue
        const yc = Math.round(yOf(m) + rowH / 2) + 0.5
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, yc)
        ctx.lineTo(cssWidth, yc)
        ctx.stroke()
        // small "C4"-style label tucked at the left edge
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)'
        ctx.fillText(`C${Math.floor(m / 12) - 1}`, 4, yOf(m))
      }
    }

    // ── Pass 2: notes drawn at timeline level (extending across every
    //   touching clip they sound through), then per-clip clipping clips
    //   them to the visible region of each clip card. ───────────────────
    for (const n of notes) {
      const chunk = chunkEndAt(clips, n.startMs) ?? n.endMs
      const audibleEnd = Math.min(n.endMs, chunk)
      if (audibleEnd <= n.startMs) continue
      ctx.fillStyle = noteFill(n.midi, n.velocity)
      const ny = yOf(n.midi) - noteHeight / 2
      // Find every clip the audible span overlaps and draw a piece per
      // clip — so the 1 px clip-card inset gap reads as a tiny seam
      // through the otherwise-continuous note bar.
      for (const c of clips) {
        if (audibleEnd <= c.startMs || n.startMs >= c.endMs) continue
        const drawStart = Math.max(n.startMs, c.startMs)
        const drawEnd   = Math.min(audibleEnd, c.endMs)
        if (drawEnd <= drawStart) continue
        const leftPx  = xOf(c.startMs)
        const widthPx = xOf(c.endMs) - leftPx
        const clipX   = leftPx + CLIP_INSET_PX
        const clipR   = leftPx + widthPx - CLIP_INSET_PX
        const nx      = Math.max(clipX, xOf(drawStart))
        const nrEnd   = Math.min(clipR, xOf(drawEnd))
        const nw      = Math.max(NOTE_MIN_WIDTH_PX, nrEnd - nx)
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath()
          ctx.roundRect(nx, ny, nw, noteHeight, NOTE_RADIUS_PX)
          ctx.fill()
        } else {
          ctx.fillRect(nx, ny, nw, noteHeight)
        }
      }
    }

    // ── Pass 3: clip outlines on top of notes + body tint. ──────────────
    for (const c of clips) {
      const leftPx  = xOf(c.startMs)
      const widthPx = xOf(c.endMs) - leftPx
      if (widthPx <= 0) continue
      const clipX = leftPx + CLIP_INSET_PX
      const clipW = widthPx - CLIP_INSET_PX * 2
      if (clipW <= 0) continue
      const isSelected = c.id === selectedClipId
      ctx.strokeStyle = isSelected
        ? 'rgba(103, 232, 249, 0.85)'   // cyan — selected
        : c.locked
          ? 'rgba(251, 191, 36, 0.70)'  // amber — locked
          : 'rgba(148, 163, 184, 0.55)' // slate — neutral
      ctx.lineWidth = isSelected ? 1.5 : 1
      ctx.beginPath()
      const ox = clipX + OUTLINE_INSET_PX
      const ow = clipW - OUTLINE_INSET_PX * 2
      const oy = OUTLINE_INSET_PX
      const oh = cssHeight - OUTLINE_INSET_PX * 2
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(ox, oy, ow, oh, CLIP_RADIUS_PX)
      } else {
        ctx.rect(ox, oy, ow, oh)
      }
      ctx.stroke()
    }
  }, [notes, clips, durationMs, selectedClipId, range, showMeasureLines])

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
