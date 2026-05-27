import React from 'react'
import type { Clip } from '@/freeMode'

// Hit-zone + ring outline overlaid on top of the timeline waveform canvas
// for one clip.  Captures right-click → context menu and mousedown →
// drag-to-reorder.  The waveform bars beneath are tinted by clip selection
// inside TimelineWaveform itself, so the overlay only contributes the ring
// outline, the lock / volume / comment badges, and the drag transform.
interface Props {
  clip:            Clip
  leftPct:         number
  widthPct:        number
  selected:        boolean
  draggable:       boolean
  isBeingDragged:  boolean
  dragTranslatePx: number
  offsetMsToView:  number       // shift applied during another clip's drag
  range:           number
  pxPerMs:         number
  anyDragging:     boolean
  onMouseDown?:    (e: React.MouseEvent) => void
}

export default function ClipOverlay({
  clip, leftPct, widthPct, selected, draggable,
  isBeingDragged, dragTranslatePx, offsetMsToView, pxPerMs,
  anyDragging, onMouseDown,
}: Props): React.JSX.Element {
  const translateX = isBeingDragged
    ? dragTranslatePx
    : offsetMsToView * pxPerMs
  const transform = isBeingDragged
    ? `translate3d(${dragTranslatePx}px, 0, 0) rotate(0.6deg) scale(1.03)`
    : translateX !== 0
      ? `translateX(${translateX}px)`
      : undefined
  const transition = isBeingDragged
    ? 'none'
    : anyDragging
      ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
      : undefined

  return (
    <div
      onMouseDown={onMouseDown}
      className={[
        'absolute top-1 bottom-1 rounded-lg',
        isBeingDragged
          ? 'pointer-events-none z-[30] ring-2 ring-blue-300 shadow-2xl shadow-blue-500/40'
          : 'pointer-events-auto z-[5]',
        selected
          ? 'ring-2 ring-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.4),0_0_14px_rgba(103,232,249,0.35)]'
          : clip.locked
            ? 'ring-1 ring-amber-400/80'
            : '',
      ].join(' ')}
      style={{
        left:   `calc(${leftPct}% + 1px)`,
        width:  `calc(${widthPct}% - 2px)`,
        transform,
        transition,
        cursor: clip.locked
          ? 'not-allowed'
          : isBeingDragged
            ? 'grabbing'
            : draggable ? 'grab' : 'pointer',
      }}
    >
      {clip.locked && (
        <span className="absolute top-1 left-2 px-1 py-px rounded-sm bg-amber-500/95 text-white text-[8px] font-bold tracking-wide pointer-events-none">
          LOCK
        </span>
      )}
      {clip.comment && (
        <span
          title={clip.comment}
          className="absolute top-1 right-2 px-1.5 py-px rounded-full bg-emerald-500/95 text-white text-[9px] font-medium pointer-events-auto cursor-help"
        >
          ●
        </span>
      )}
      {Math.round(clip.volume * 100) !== 100 && (
        <span className="absolute bottom-1 right-2 px-1 rounded-sm bg-slate-900/80 text-white text-[8px] font-mono tabular-nums pointer-events-none">
          {Math.round(clip.volume * 100)}%
        </span>
      )}
    </div>
  )
}
