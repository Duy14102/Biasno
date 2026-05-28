import React from 'react'

// Clipchamp-style "window-closing" trim handle.  Used for both ends of the
// trim window.  The drag logic lives in the parent TrimRange — this is just
// the visual + the grab area.
export default function TrimHandle({
  side, pct, onMouseDown, dragging, snapping,
}: {
  side: 'left' | 'right'
  pct: number
  onMouseDown: (e: React.MouseEvent) => void
  dragging: boolean
  snapping: boolean
}): React.JSX.Element {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute top-0 bottom-0 w-3.5 -ml-1.5 cursor-ew-resize z-20 flex items-center justify-center group"
      style={{ left: `${pct}%`, touchAction: 'none' }}
      aria-label={side === 'left' ? 'Trim start' : 'Trim end'}
      role="slider"
    >
      <div
        className={[
          'h-full w-2.5 rounded-sm flex flex-col items-center justify-center gap-1',
          'shadow-md transition-all',
          snapping
            ? 'bg-amber-400 shadow-amber-500/70 scale-y-[1.08]'
            : dragging
              ? 'bg-blue-400 shadow-blue-500/60 scale-y-[1.04]'
              : 'bg-blue-500 group-hover:bg-blue-400 group-hover:shadow-blue-500/40',
        ].join(' ')}
      >
        <span className="w-1 h-px bg-white/90 rounded-full" />
        <span className="w-1 h-px bg-white/90 rounded-full" />
        <span className="w-1 h-px bg-white/90 rounded-full" />
      </div>
    </div>
  )
}
