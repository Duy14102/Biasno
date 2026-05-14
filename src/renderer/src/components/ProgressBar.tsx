import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { LoopRegion } from '../types'

interface ProgressBarProps {
  duration: number
  currentTime: number
  loopRegion: LoopRegion | null
  onSeek: (time: number) => void
  onLoopChange: (region: LoopRegion | null) => void
}

type DragMode = 'seek' | 'loop-start' | 'loop-end' | 'loop-move' | null

const ANIM_CSS = `
  @keyframes pb-shimmer {
    0%   { left: -40%; }
    100% { left: 130%; }
  }
  @keyframes pb-glow {
    0%, 100% { box-shadow: 0 0 0 3px rgba(96,165,250,0.45), 0 2px 8px rgba(0,0,0,0.4); }
    50%       { box-shadow: 0 0 0 6px rgba(96,165,250,0.18), 0 0 16px rgba(59,130,246,0.55); }
  }
  .pb-shimmer { animation: pb-shimmer 2.4s ease-in-out infinite; }
  .pb-glow    { animation: pb-glow 2s ease-in-out infinite; }
`

function formatTime(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ProgressBar({
  duration, currentTime, loopRegion, onSeek, onLoopChange
}: ProgressBarProps): React.JSX.Element {
  const barRef        = useRef<HTMLDivElement>(null)
  const [dragMode, setDragMode]   = useState<DragMode>(null)
  const [hovering, setHovering]   = useState(false)
  // Live cursor-x fraction (0–1) while the mouse is over the bar — drives the
  // floating time tooltip.  Null when the cursor is elsewhere so the tooltip
  // disappears cleanly.
  const [hoverFrac, setHoverFrac] = useState<number | null>(null)
  const dragStartX    = useRef(0)
  const dragStartLoop = useRef<LoopRegion | null>(null)

  const progress   = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const isDragging = dragMode !== null

  const xToFraction = useCallback((clientX: number): number => {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const frac = xToFraction(e.clientX)
    const bar  = barRef.current
    if (!bar) return
    const rect    = bar.getBoundingClientRect()
    const hitZone = 10 / rect.width

    if (loopRegion && e.shiftKey) { onLoopChange(null); return }

    if (loopRegion) {
      if (Math.abs(frac - loopRegion.start) < hitZone) { setDragMode('loop-start'); return }
      if (Math.abs(frac - loopRegion.end)   < hitZone) { setDragMode('loop-end');   return }
      if (frac >= loopRegion.start && frac <= loopRegion.end) {
        dragStartX.current    = frac
        dragStartLoop.current = { ...loopRegion }
        setDragMode('loop-move'); return
      }
    }

    setDragMode('seek')
    onSeek(frac * duration)
  }, [xToFraction, loopRegion, onLoopChange, onSeek, duration])

  useEffect(() => {
    if (!dragMode) return
    const onMove = (e: MouseEvent) => {
      const frac = xToFraction(e.clientX)
      if (dragMode === 'seek') {
        onSeek(frac * duration)
      } else if (dragMode === 'loop-start' && loopRegion) {
        onLoopChange({ start: Math.min(frac, loopRegion.end - 0.01), end: loopRegion.end })
      } else if (dragMode === 'loop-end' && loopRegion) {
        onLoopChange({ start: loopRegion.start, end: Math.max(frac, loopRegion.start + 0.01) })
      } else if (dragMode === 'loop-move' && loopRegion && dragStartLoop.current) {
        const delta    = frac - dragStartX.current
        const len      = dragStartLoop.current.end - dragStartLoop.current.start
        const newStart = Math.max(0, Math.min(1 - len, dragStartLoop.current.start + delta))
        onLoopChange({ start: newStart, end: newStart + len })
      }
    }
    const onUp = () => setDragMode(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragMode, xToFraction, duration, loopRegion, onSeek, onLoopChange])

  const active = isDragging || hovering
  const headSize = active ? 22 : 18

  return (
    <>
      <style>{ANIM_CSS}</style>
      <div
        className="flex items-center gap-3 px-4 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-700/60 select-none"
        style={{ height: 48 }}
      >
        {/* Current time — slightly larger / brighter so it pops against the
            track. Tabular-nums keeps the digits from jitterring as time ticks. */}
        <span className="text-sm font-mono font-semibold text-slate-100 tabular-nums w-12 text-right shrink-0">
          {formatTime(currentTime)}
        </span>

        {/* ── Track ─────────────────────────────────────────────────────── */}
        <div
          ref={barRef}
          className="relative flex-1 rounded-full cursor-pointer group"
          style={{ height: 10 }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => { setHovering(false); setHoverFrac(null) }}
          onMouseMove={(e) => { if (!isDragging) setHoverFrac(xToFraction(e.clientX)) }}
        >
          {/* Background track — inset shadow gives a subtle "groove" feel. */}
          <div
            className="absolute inset-0 rounded-full transition-colors duration-150"
            style={{
              background: active ? '#334155' : '#1e293b',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)',
            }}
          />

          {/* Loop region */}
          {loopRegion && (
            <>
              <div
                className="absolute top-0 h-full rounded border-l-2 border-r-2 border-amber-400/90"
                style={{
                  left:       `${loopRegion.start * 100}%`,
                  width:      `${(loopRegion.end - loopRegion.start) * 100}%`,
                  background: 'rgba(251,191,36,0.18)'
                }}
              />
              {[loopRegion.start, loopRegion.end].map((pos, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-6 bg-amber-400 rounded-sm cursor-ew-resize shadow-md shadow-amber-500/30"
                  style={{ left: `calc(${pos * 100}% - 6px)`, zIndex: 10 }}
                />
              ))}
            </>
          )}

          {/* Progress fill + shimmer */}
          <div
            className="absolute left-0 top-0 h-full rounded-full overflow-hidden transition-none"
            style={{
              width:      `${progress * 100}%`,
              background: 'linear-gradient(90deg,#2563eb 0%,#3b82f6 60%,#60a5fa 100%)',
              boxShadow:  progress > 0 ? '0 0 12px rgba(59,130,246,0.4)' : 'none',
            }}
          >
            {progress > 0 && (
              <div
                className="pb-shimmer absolute top-0 bottom-0 w-2/5"
                style={{
                  background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.28) 50%,transparent 100%)'
                }}
              />
            )}
          </div>

          {/* Hover preview marker — vertical hairline at cursor x. */}
          {hoverFrac !== null && !isDragging && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-slate-300/50 pointer-events-none"
              style={{ left: `${hoverFrac * 100}%` }}
            />
          )}

          {/* Playhead */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white transition-none ${progress > 0 ? 'pb-glow' : ''}`}
            style={{
              width:  headSize,
              height: headSize,
              left:   `calc(${progress * 100}% - ${headSize / 2}px)`,
              zIndex: 5,
              transition: isDragging ? 'none' : 'width 0.12s, height 0.12s'
            }}
          />

          {/* Hover time tooltip — floats above the bar at cursor x. */}
          {hoverFrac !== null && !isDragging && (
            <div
              className="absolute -top-7 pointer-events-none z-20"
              style={{ left: `${hoverFrac * 100}%`, transform: 'translateX(-50%)' }}
            >
              <div className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600/80 text-[11px] text-slate-100 font-mono tabular-nums shadow-lg whitespace-nowrap">
                {formatTime(hoverFrac * duration)}
              </div>
            </div>
          )}
        </div>

        {/* Total time */}
        <span className="text-sm font-mono text-slate-500 tabular-nums w-12 shrink-0">
          {formatTime(duration)}
        </span>
      </div>
    </>
  )
}
