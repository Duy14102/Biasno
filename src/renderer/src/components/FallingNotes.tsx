import React, { useRef, useEffect, useCallback } from 'react'
import type { MidiNote, NoteVisualState } from '../types'
import {
  PIANO_MIN, PIANO_MAX, TOTAL_WHITE_KEYS,
  isBlackKey, getWhiteKeyIndex, getBlackKeyFraction,
  HAND_COLORS
} from '../utils/noteUtils'

const PX_PER_SECOND = 240
const LOOK_AHEAD    = 4.5   // seconds ahead to show notes

export interface NoteRenderState {
  note: MidiNote
  state: NoteVisualState
  flashAlpha?: number
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function getNoteRect(midi: number, canvasWidth: number): { x: number; w: number } {
  const whiteW = canvasWidth / TOTAL_WHITE_KEYS

  if (!isBlackKey(midi)) {
    const idx = getWhiteKeyIndex(midi)
    const gap = Math.max(1, whiteW * 0.04)
    return { x: idx * whiteW + gap, w: whiteW - gap * 2 }
  } else {
    const blackW = whiteW * 0.65
    const frac   = getBlackKeyFraction(midi)
    const cx     = frac * canvasWidth
    return { x: cx - blackW / 2, w: blackW }
  }
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  const radius = Math.min(r, w / 2, Math.max(h, 0) / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

// ─── Component ────────────────────────────────────────────────────────────────
interface FallingNotesProps {
  notes: NoteRenderState[]
  currentTime: number
  keyboardHeight: number
  practiceMode?: boolean     // when true: no positional glow — notes only light on 'hit'
  zoom?: number              // 0.5–2.0, default 1.0
  showLaneLines?: boolean    // show vertical key-lane dividers, default true
  onCanvasReady?: (canvas: HTMLCanvasElement) => void
}

export default function FallingNotes({
  notes, currentTime, keyboardHeight, practiceMode = false,
  zoom = 1, showLaneLines = true,
  onCanvasReady
}: FallingNotesProps): React.JSX.Element {
  const canvasRef           = useRef<HTMLCanvasElement>(null)
  const containerRef        = useRef<HTMLDivElement>(null)
  const notesRef            = useRef(notes)
  const timeRef             = useRef(currentTime)
  const practiceModeRef     = useRef(practiceMode)
  const zoomRef             = useRef(zoom)
  const showLaneLinesRef    = useRef(showLaneLines)
  const rafRef              = useRef(0)

  useEffect(() => { notesRef.current        = notes },        [notes])
  useEffect(() => { timeRef.current         = currentTime },  [currentTime])
  useEffect(() => { practiceModeRef.current = practiceMode }, [practiceMode])
  useEffect(() => { zoomRef.current         = zoom },         [zoom])
  useEffect(() => { showLaneLinesRef.current = showLaneLines }, [showLaneLines])

  // Resize observer
  useEffect(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      // Use offsetWidth/Height — these are the LAYOUT size and are unaffected
      // by any `transform: scale(...)` on an ancestor (e.g. the view-swap
      // animation).  getBoundingClientRect returns the visually-transformed
      // rect, so if the canvas was first sized mid-animation while the parent
      // was at scale(0.94), the canvas would lock in at 94 % of its true size
      // — manifesting as a thin gap between the canvas bottom and the piano.
      const w = container.offsetWidth
      const h = container.offsetHeight
      if (!w || !h) return
      canvas.width  = w * dpr
      canvas.height = h * dpr
      canvas.style.width  = w + 'px'
      canvas.style.height = h + 'px'
    }

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()
    if (onCanvasReady) onCanvasReady(canvas)
    return () => ro.disconnect()
  }, [onCanvasReady])

  // ─── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return }

    const dpr  = window.devicePixelRatio || 1
    const W    = canvas.width
    const H    = canvas.height
    const hitY = H   // hit line is at canvas bottom (piano starts below)
    const pps  = PX_PER_SECOND * zoomRef.current   // pixels per song-second (zoom-scaled)

    ctx.clearRect(0, 0, W, H)

    // ── Background ──────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#0a0f1e')
    bg.addColorStop(1, '#111827')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const whiteW = W / TOTAL_WHITE_KEYS

    // ── Vertical key-lane dividers ──────────────────────────────────────────
    if (showLaneLinesRef.current) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth   = 1
      for (let i = 0; i <= TOTAL_WHITE_KEYS; i++) {
        const x = Math.round(i * whiteW) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
    }

    const now = timeRef.current

    // ── Hit line glow ───────────────────────────────────────────────────────
    const hitGrad = ctx.createLinearGradient(0, hitY - 14, 0, hitY)
    hitGrad.addColorStop(0, 'rgba(255,255,255,0.0)')
    hitGrad.addColorStop(1, 'rgba(255,255,255,0.14)')
    ctx.fillStyle = hitGrad
    ctx.fillRect(0, hitY - 14, W, 14)

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.moveTo(0, hitY - 0.75)
    ctx.lineTo(W, hitY - 0.75)
    ctx.stroke()

    // ── Notes ───────────────────────────────────────────────────────────────
    const renderNotes = notesRef.current
    const effectiveLookAhead = LOOK_AHEAD / zoomRef.current

    for (const { note, state, flashAlpha = 0 } of renderNotes) {
      const noteEndTime  = note.time + note.duration
      const noteTopDelta = note.time   - now   // >0 = start in future
      const noteBotDelta = noteEndTime - now   // >0 = end in future

      if (noteBotDelta < -0.1)              continue  // fully passed
      if (noteTopDelta > effectiveLookAhead) continue  // too far ahead

      const { x, w } = getNoteRect(note.midi, W)

      // yTop = bottom of the drawn rect = the note's leading edge (hits piano first)
      const yTop  = hitY - noteTopDelta * pps
      const yBot  = hitY - noteBotDelta * pps
      const noteH = Math.max(yTop - yBot, 4 * dpr)
      const y     = yBot

      const isHit     = state === 'hit'
      const isHolding = state === 'holding'
      const isMissed  = state === 'missed'
      const isBlack   = isBlackKey(note.midi)

      // Confirmed hit: hide the note once its leading edge has reached the hit line
      // 'holding' (key pressed but not yet confirmed) stays visible while player holds
      if (isHit && noteTopDelta <= 0.05) continue

      // 4-color scheme: right white / right black / left white / left black
      const NOTE_COLORS: Record<string, { normal: string; glow: string; hit: string; miss: string }> = {
        'right-white': { normal: '#4A9EFF', glow: '#80C4FF', hit: '#44ee88', miss: '#ff4455' },
        'right-black': { normal: '#1A6ECC', glow: '#3B99FF', hit: '#44ee88', miss: '#ff4455' },
        'left-white':  { normal: '#FF8833', glow: '#FFAA66', hit: '#44ee88', miss: '#ff4455' },
        'left-black':  { normal: '#CC4411', glow: '#FF6633', hit: '#44ee88', miss: '#ff4455' },
        'unknown':     { normal: '#88AACC', glow: '#AACCEE', hit: '#44ee88', miss: '#ff4455' },
      }
      const colorKey = note.hand === 'right' ? (isBlack ? 'right-black' : 'right-white')
                     : note.hand === 'left'  ? (isBlack ? 'left-black'  : 'left-white')
                     : 'unknown'
      const colors = NOTE_COLORS[colorKey]

      // ── Geometric glow ────────────────────────────────────────────────────
      // In view-listen: glow when note head physically touches the hit line.
      // In practice mode: positional glow is OFF — only 'hit' state triggers glow.
      const headNearLine = !practiceModeRef.current && yTop >= hitY - 8 * dpr * zoomRef.current

      let baseColor = headNearLine ? colors.glow : colors.normal
      if (isHit || isHolding) baseColor = colors.hit   // both confirmed & in-progress show green
      if (isMissed)           baseColor = colors.miss

      ctx.save()

      ctx.shadowColor = baseColor
      ctx.shadowBlur  = (headNearLine || isHit || isHolding) && !isMissed ? 18 * dpr : isMissed ? 0 : 3 * dpr
      ctx.globalAlpha = isMissed ? 0.35 : 1.0

      // Note gradient (shimmer left → right)
      const grad = ctx.createLinearGradient(x, 0, x + w, 0)
      grad.addColorStop(0,    baseColor + 'cc')
      grad.addColorStop(0.35, baseColor)
      grad.addColorStop(0.65, baseColor)
      grad.addColorStop(1,    baseColor + 'cc')

      const r = isBlackKey(note.midi) ? 3 * dpr : 4 * dpr
      drawRoundRect(ctx, x, y, w, noteH, r)
      ctx.fillStyle = grad
      ctx.fill()

      // Highlight stripe at top of note body
      if (!isMissed) {
        const stripeH = Math.min(4 * dpr, noteH * 0.25)
        drawRoundRect(ctx, x + w * 0.1, y, w * 0.8, stripeH, r)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fill()
      }

      // Flash overlay
      if (flashAlpha > 0) {
        const flashColor = isHit ? 'rgba(255,255,255,' : 'rgba(255,60,60,'
        ctx.globalAlpha  = flashAlpha * (isMissed ? 0.35 : 1.0)
        drawRoundRect(ctx, x, y, w, noteH, r)
        ctx.fillStyle = flashColor + `${flashAlpha * 0.7})`
        ctx.fill()
      }

      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
