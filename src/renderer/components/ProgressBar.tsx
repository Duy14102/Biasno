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
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
  }
  @keyframes pb-fade-in {
    from { opacity: 0; transform: translate(-50%, 4px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
  .pb-shimmer   { animation: pb-shimmer 2.8s ease-in-out infinite; }
  .pb-tooltip   { animation: pb-fade-in 0.14s ease-out forwards; }
  .pb-track     { transition: height 0.18s cubic-bezier(0.4,0,0.2,1); }
  .pb-head      { transition: transform 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s ease-out; }
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
  const [hoverFrac, setHoverFrac] = useState<number | null>(null)
  // Toggle between "elapsed / total" and "elapsed / -remaining" by clicking
  // the right-hand time label — common pattern in media players.
  const [showRemaining, setShowRemaining] = useState(false)
  const dragStartX    = useRef(0)
  const dragStartLoop = useRef<LoopRegion | null>(null)

  const progress   = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const isDragging = dragMode !== null
  const active     = isDragging || hovering

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
    const hitZone = 12 / rect.width

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
        setHoverFrac(frac)
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

  const cursorStyle =
    dragMode === 'loop-start' || dragMode === 'loop-end' ? 'ew-resize'
    : dragMode === 'loop-move' ? 'grabbing'
    : 'pointer'

  return (
    <>
      <style>{ANIM_CSS}</style>
      <div
        className="flex items-center gap-4 px-5 bg-white dark:bg-slate-900 dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border-b border-slate-300 dark:border-slate-700/60 select-none"
        style={{ height: 52 }}
      >
        {/* Elapsed time */}
        <span className="text-[13px] font-mono font-semibold text-slate-800 dark:text-slate-50 tabular-nums w-14 text-right shrink-0 tracking-tight">
          {formatTime(currentTime)}
        </span>

        {/* ── Track ─────────────────────────────────────────────────────── */}
        <div
          ref={barRef}
          className="relative flex-1 group"
          style={{ height: 24, cursor: cursorStyle }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => { setHovering(false); setHoverFrac(null) }}
          onMouseMove={(e) => { if (!isDragging) setHoverFrac(xToFraction(e.clientX)) }}
        >
          {/* Background track — taller hit-area; visible track sits centred. */}
          <div
            className={[
              'pb-track absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full',
              active
                ? 'bg-slate-300/90 dark:bg-slate-700'
                : 'bg-slate-200 dark:bg-slate-800',
            ].join(' ')}
            style={{
              height: active ? 8 : 6,
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.18)',
            }}
          />

          {/* Loop region (under the playhead, above the track) */}
          {loopRegion && (
            <>
              <div
                className="absolute top-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left:       `${loopRegion.start * 100}%`,
                  width:      `${(loopRegion.end - loopRegion.start) * 100}%`,
                  height:     active ? 8 : 6,
                  background: 'linear-gradient(180deg, rgba(251,191,36,0.32), rgba(245,158,11,0.22))',
                  boxShadow:  '0 0 0 1px rgba(251,191,36,0.55) inset',
                }}
              />
              {[loopRegion.start, loopRegion.end].map((pos, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 rounded-[3px] bg-amber-400 shadow-md shadow-amber-500/40 ring-2 ring-white/70 dark:ring-slate-900/80 flex flex-col items-center justify-center gap-[2px]"
                  style={{
                    width: 6,
                    height: 14,
                    left: `calc(${pos * 100}% - 3px)`,
                    cursor: 'ew-resize',
                    zIndex: 10,
                  }}
                  title={i === 0 ? 'Loop start' : 'Loop end'}
                >
                  <span className="block w-[2px] h-[2px] rounded-full bg-amber-900/50" />
                  <span className="block w-[2px] h-[2px] rounded-full bg-amber-900/50" />
                </div>
              ))}
            </>
          )}

          {/* Progress fill */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
            style={{
              width:      `${progress * 100}%`,
              height:     active ? 8 : 6,
              background: 'linear-gradient(90deg,#2563eb 0%,#3b82f6 55%,#60a5fa 100%)',
              boxShadow:  progress > 0
                ? (active
                  ? '0 0 14px rgba(59,130,246,0.55), 0 1px 2px rgba(37,99,235,0.4)'
                  : '0 0 8px rgba(59,130,246,0.35)')
                : 'none',
            }}
          >
            {progress > 0 && progress < 1 && (
              <div
                className="pb-shimmer absolute inset-y-0 w-1/3"
                style={{
                  background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.35) 50%,transparent 100%)',
                }}
              />
            )}
          </div>

          {/* Hover preview marker — vertical hairline at cursor x. */}
          {hoverFrac !== null && !isDragging && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px bg-slate-500/50 dark:bg-slate-300/40 pointer-events-none rounded-full"
              style={{ left: `${hoverFrac * 100}%`, height: 16 }}
            />
          )}

          {/* Playhead */}
          <div
            className="pb-head absolute top-1/2 rounded-full bg-white dark:bg-white ring-[3px] ring-blue-500 dark:ring-blue-400 shadow-lg"
            style={{
              width:  16,
              height: 16,
              left:   `calc(${progress * 100}% - 8px)`,
              top:    '50%',
              transform: `translateY(-50%) scale(${active ? 1.18 : 1})`,
              boxShadow: active
                ? '0 0 0 6px rgba(59,130,246,0.18), 0 2px 8px rgba(0,0,0,0.35)'
                : '0 2px 6px rgba(0,0,0,0.3)',
              zIndex: 5,
            }}
          />

          {/* Hover time tooltip — floats above the bar with a small caret. */}
          {hoverFrac !== null && (
            <div
              className="pb-tooltip absolute pointer-events-none z-20"
              style={{ left: `${hoverFrac * 100}%`, bottom: 'calc(100% + 6px)', transform: 'translateX(-50%)' }}
            >
              <div className="relative px-2 py-1 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[11px] font-mono font-semibold tabular-nums shadow-xl whitespace-nowrap">
                {formatTime(hoverFrac * duration)}
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
                  style={{
                    borderLeft:  '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop:   '4px solid currentColor',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Total / remaining toggle */}
        <button
          type="button"
          onClick={() => setShowRemaining((v) => !v)}
          className="text-[13px] font-mono text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 tabular-nums w-14 text-left shrink-0 tracking-tight transition-colors cursor-pointer"
          title={showRemaining ? 'Show total time' : 'Show remaining time'}
        >
          {showRemaining
            ? `-${formatTime(Math.max(0, duration - currentTime))}`
            : formatTime(duration)}
        </button>
      </div>
    </>
  )
}
