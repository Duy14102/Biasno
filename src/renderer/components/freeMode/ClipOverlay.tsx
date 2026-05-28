import React, { useEffect, useRef, useState } from 'react'
import type { Clip } from '@/freeMode'
import { BubbleIcon } from './icons'

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

// Chat-bubble comment badge.  Collapsed: round pill with just the bubble
// glyph, anchored to the clip's top-right corner.  Hover: animates open
// to the left, revealing the comment text.  If the text overflows the
// bubble at full expansion, swaps to a seamless duplicated marquee that
// scrolls infinitely; otherwise stays static.
function CommentBubble({ text }: { text: string }): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textRef    = useRef<HTMLSpanElement>(null)
  const [hovered, setHovered] = useState(false)
  const [marquee, setMarquee] = useState(false)

  useEffect(() => {
    if (!hovered) { setMarquee(false); return }
    const id = window.setTimeout(() => {
      const w = wrapperRef.current
      const t = textRef.current
      if (!w || !t) return
      setMarquee(t.scrollWidth > w.clientWidth + 1)
    }, 340)
    return () => window.clearTimeout(id)
  }, [hovered, text])

  const marqueeDur = `${Math.max(5, Math.min(20, text.length * 0.22))}s`

  return (
    <div
      className="fm-comment-bubble absolute top-1 right-2 z-[15] pointer-events-auto"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        className={[
          'flex flex-row-reverse items-center h-[18px] cursor-help select-none',
          'rounded-full rounded-bl-[3px]',
          'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500',
          'ring-1 ring-emerald-200/60',
          'transition-[max-width,padding,box-shadow] duration-[320ms]',
          'ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden',
          hovered
            ? 'max-w-[220px] pl-2 pr-1.5 shadow-[0_4px_14px_-2px_rgba(16,185,129,0.65)]'
            : 'max-w-[18px] px-[3px] shadow-[0_2px_8px_-2px_rgba(16,185,129,0.5)]',
        ].join(' ')}
        title={text}
      >
        <BubbleIcon className="w-3 h-3 text-white shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" />
        <div
          ref={wrapperRef}
          className={[
            'min-w-0 overflow-hidden mr-1',
            'transition-opacity duration-200',
            hovered ? 'opacity-100 delay-[120ms]' : 'opacity-0',
          ].join(' ')}
        >
          <div
            className="inline-flex whitespace-nowrap will-change-transform"
            style={marquee
              ? { animation: `fm-comment-marquee ${marqueeDur} linear infinite` }
              : undefined}
          >
            <span
              ref={textRef}
              className={[
                'text-white text-[10px] font-medium leading-none tracking-tight',
                marquee ? 'pr-8' : '',
              ].join(' ')}
            >
              {text}
            </span>
            {marquee && (
              <span
                aria-hidden
                className="text-white text-[10px] font-medium leading-none tracking-tight pr-8"
              >
                {text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
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
      {clip.comment && <CommentBubble text={clip.comment} />}
      {Math.round(clip.volume * 100) !== 100 && (
        <span className="absolute bottom-1 right-2 px-1 rounded-sm bg-slate-900/80 text-white text-[8px] font-mono tabular-nums pointer-events-none">
          {Math.round(clip.volume * 100)}%
        </span>
      )}
    </div>
  )
}
