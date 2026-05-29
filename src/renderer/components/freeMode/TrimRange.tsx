// Coordinator for the Free-Mode timeline.  Owns nothing complex itself —
// every sub-feature lives in a focused hook or sub-component:
//
//   • ClipNotesPreview  — Canvas2D piano-roll painted from notes data
//   • TimelineRuler     — ms ticks + labels
//   • TrimHandle        — visual handle (drag logic in useTrimDrag)
//   • useTrimDrag       — handle drag with snap-to-playhead
//   • useClipDrag       — clip drag-to-reorder + autoscroll
//   • useTimelineScale  — px/ms with hold-on-extension
//   • ClipOverlay       — per-clip hit zone (right-click + drag start)
//   • ClipContextMenu   — split / copy / paste / lock / volume / comment
//
// This file just wires them up and paints the static layers (trim labels,
// outside-trim dim, playhead).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Clip, ClipView, RecordedNote } from '@/freeMode'
import { clipAt } from '@/freeMode'
import ClipContextMenu, { type ClipMenuActions } from './ClipContextMenu'
import ClipNotesPreview from './ClipNotesPreview'
import ClipOverlay from './ClipOverlay'
import TimelineRuler from './TimelineRuler'
import TrimHandle from './TrimHandle'
import { PlusCircleIcon } from './icons'
import { TIMELINE_STYLES } from './timelineStyles'
import { useClipDrag, computePreviewPositions, computePlaceholderRange } from './useClipDrag'
import { useTimelineScale } from './useTimelineScale'
import { useTrimDrag } from './useTrimDrag'

interface Props {
  min:           number
  max:           number
  startMs:       number
  endMs:         number
  notes:         RecordedNote[]
  onDraftStart:  (ms: number) => void
  onDraftEnd:    (ms: number) => void
  onCommitStart: (ms: number) => void
  onCommitEnd:   (ms: number) => void
  formatMs:      (ms: number) => string
  minGap?:       number
  playbackMs?:      number
  playbackActive?:  boolean
  onSeek?:          (ms: number) => void
  clips?:           Clip[]
  hasClipboard?:    boolean
  snapshotForMenu?: ClipView
  clipActions?:     ClipMenuActions
  onAddSegment?:    () => void
  addSegmentLabel?: string
  onMoveClip?:      (clipId: string, slot: number) => void
  showMeasureLines?: boolean
}

export default function TrimRange({
  min, max, startMs, endMs, notes,
  onDraftStart, onDraftEnd, onCommitStart, onCommitEnd,
  formatMs, minGap = 50,
  playbackMs, playbackActive, onSeek,
  clips, hasClipboard, snapshotForMenu, clipActions,
  onAddSegment, addSegmentLabel,
  onMoveClip,
  showMeasureLines = false,
}: Props): React.JSX.Element {
  const range   = Math.max(1, max - min)
  const startPct = ((startMs - min) / range) * 100
  const endPct   = ((endMs   - min) / range) * 100

  const { pxPerMs, scaledMinWidth, containerRef: scrollContainerRef } = useTimelineScale(range, max)

  // Drive the trim-start / trim-end chips via direct DOM writes so they
  // pin to the viewport synchronously while the user scrolls — React
  // state lags one frame and makes the chips look like they scroll along
  // with the timeline.  rAF coalesces bursts; the chips themselves use
  // `transform: translateX()` so the GPU handles the motion.
  const startChipRef = useRef<HTMLSpanElement>(null)
  const endChipRef   = useRef<HTMLSpanElement>(null)
  const LABEL_HALF_PX = 28
  const EDGE_PAD_PX   = 6
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    let raf = 0
    const apply = () => {
      raf = 0
      const sx = el.scrollLeft
      const vw = el.clientWidth
      const visL = sx + LABEL_HALF_PX + EDGE_PAD_PX
      const visR = Math.max(visL, sx + vw - LABEL_HALF_PX - EDGE_PAD_PX)
      const sNat = (startMs - min) * pxPerMs
      const eNat = (endMs   - min) * pxPerMs
      const sClamped = Math.max(visL, Math.min(visR, sNat))
      const eClamped = Math.max(visL, Math.min(visR, eNat))
      const sChip = startChipRef.current
      const eChip = endChipRef.current
      if (sChip) {
        sChip.style.transform = `translate(${sClamped}px, 0) translateX(-50%)`
        sChip.dataset.pinned  = sClamped !== sNat ? 'true' : 'false'
      }
      if (eChip) {
        eChip.style.transform = `translate(${eClamped}px, 0) translateX(-50%)`
        eChip.dataset.pinned  = eClamped !== eNat ? 'true' : 'false'
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply) }
    apply()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [scrollContainerRef, startMs, endMs, min, pxPerMs])

  // Effective clips for hit-testing / overlays — materialise the implicit
  // default when clips[] is empty so the user can still right-click a
  // freshly-stopped recording.
  const effClips: Clip[] = useMemo(() => {
    if (clips && clips.length > 0) return clips
    return [{ id: 'default', startMs, endMs, volume: 1, locked: false } as Clip]
  }, [clips, startMs, endMs])

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  // After a split/delete/move the previously-selected clip may no longer
  // exist (split assigns fresh ids to the two halves; delete removes
  // one).  Clear the stale reference so the outline state matches reality
  // and the user isn't looking at a "phantom selection" pointing at a
  // clip that's gone.
  useEffect(() => {
    if (selectedClipId !== null && !effClips.find(c => c.id === selectedClipId)) {
      setSelectedClipId(null)
    }
  }, [effClips, selectedClipId])

  // Clear the clip highlight when the user clicks anywhere outside the
  // timeline track (e.g., focusing the file-name / author input).
  useEffect(() => {
    if (selectedClipId === null) return
    const onPointerDown = (e: PointerEvent) => {
      const track = trackRef.current
      if (!track) return
      if (e.target instanceof Node && track.contains(e.target)) return
      setSelectedClipId(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [selectedClipId])

  const msAtClientX = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return min
    const r = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return Math.round(min + ratio * range)
  }, [min, range])

  // ── Trim handle drag ──────────────────────────────────────────────────
  const playbackMsRef = useRef<number | undefined>(playbackMs)
  playbackMsRef.current = playbackMs

  const trim = useTrimDrag({
    startMs, endMs, durationMs: max, minGapMs: minGap,
    msAtClientX, playbackMsRef,
    onDraft:  (side, ms) => side === 'start' ? onDraftStart(ms) : onDraftEnd(ms),
    onCommit: (side, ms) => side === 'start' ? onCommitStart(ms) : onCommitEnd(ms),
  })

  // ── Clip drag-to-reorder ──────────────────────────────────────────────
  const { state: drag, beginDragMaybe } = useClipDrag({
    msAtClientX,
    scrollContainer: scrollContainerRef,
    clips: effClips,
    onDrop: (clipId, slot) => onMoveClip?.(clipId, slot),
  })

  const previewMap = useMemo(
    () => drag
      ? computePreviewPositions(effClips, drag.clipId, drag.widthMs, drag.dropSlot, min)
      : new Map<string, number>(),
    [drag, effClips, min],
  )

  const placeholder = useMemo(
    () => drag && drag.dropSlot !== null
      ? computePlaceholderRange(effClips, drag.clipId, drag.widthMs, drag.dropSlot, min)
      : null,
    [drag, effClips, min],
  )

  const draggedTranslatePx = drag
    ? ((drag.cursorMs - drag.offsetMs) - drag.originalStart) * pxPerMs
    : 0

  const overPlaceholder = !!(drag && placeholder && (() => {
    const draggedCentre = drag.cursorMs - drag.offsetMs + drag.widthMs / 2
    const phCentre      = (placeholder.startMs + placeholder.endMs) / 2
    const tolerance     = Math.max(drag.widthMs * 0.4, 80)
    return Math.abs(draggedCentre - phCentre) < tolerance
  })())

  const onClipClickFallback = useCallback((clientX: number) => {
    const ms = msAtClientX(clientX)
    setSelectedClipId(effClips.find(c => ms >= c.startMs && ms <= c.endMs)?.id ?? null)
    onSeek?.(ms)
  }, [msAtClientX, onSeek, effClips])

  const beginClipDrag = useCallback((clip: Clip) => (e: React.MouseEvent) => {
    if (!onMoveClip) return
    beginDragMaybe(e, clip, onClipClickFallback)
  }, [onMoveClip, beginDragMaybe, onClipClickFallback])

  // ── Context menu ──────────────────────────────────────────────────────
  const [menu, setMenu] = useState<null | {
    x: number; y: number; atMs: number; splitAtMs: number; clipHere: Clip | null
  }>(null)
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!clipActions || !snapshotForMenu) return
    e.preventDefault()
    const ms = msAtClientX(e.clientX)
    const here = clipAt(snapshotForMenu, ms)
    setSelectedClipId(here?.id ?? null)
    const playhead = playbackMs !== undefined ? Math.round(playbackMs) : ms
    setMenu({ x: e.clientX, y: e.clientY, atMs: ms, splitAtMs: playhead, clipHere: here })
  }, [clipActions, snapshotForMenu, msAtClientX, playbackMs])

  // ── Playhead pct + scrub drag ─────────────────────────────────────────
  const playPct = playbackMs !== undefined ? ((playbackMs - min) / range) * 100 : 0
  const [scrubbing, setScrubbing] = useState(false)
  const playVisible =
    playbackMs !== undefined &&
    ((playbackMs >= startMs && playbackMs <= endMs) || scrubbing)

  const onPlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onSeek) return
    e.preventDefault()
    e.stopPropagation()
    setScrubbing(true)
    const seek = (clientX: number) => {
      const ms = msAtClientX(clientX)
      onSeek(Math.max(startMs, Math.min(endMs, ms)))
    }
    const onMove = (ev: MouseEvent) => seek(ev.clientX)
    const onUp = () => {
      setScrubbing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onSeek, msAtClientX, startMs, endMs])

  return (
    <div className="flex flex-col gap-2 select-none">
      <style>{TIMELINE_STYLES}</style>
      <div className="flex items-stretch gap-3">

        <div ref={scrollContainerRef} className="fm-timeline-scroll flex-1 min-w-0 overflow-x-auto">
          <div className="flex flex-col gap-1.5" style={{ minWidth: scaledMinWidth }}>

            <div className="relative h-4 text-[11px] font-mono tabular-nums leading-4">
              <span
                ref={startChipRef}
                data-pinned="false"
                className="fm-trim-chip absolute top-0 left-0 px-1 rounded font-semibold text-blue-700 dark:text-blue-300"
              >
                {formatMs(startMs)}
              </span>
              <span
                ref={endChipRef}
                data-pinned="false"
                className="fm-trim-chip absolute top-0 left-0 px-1 rounded font-semibold text-blue-700 dark:text-blue-300"
              >
                {formatMs(endMs)}
              </span>
            </div>

            <TimelineRuler range={range} />

            <div
              ref={trackRef}
              onContextMenu={onContextMenu}
              className="relative h-24 rounded-xl overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200/80 dark:from-slate-900 dark:to-slate-950 ring-1 ring-slate-200/70 dark:ring-slate-800/80 shadow-inner shadow-slate-900/5 dark:shadow-black/30"
            >
              <ClipNotesPreview
                notes={notes}
                clips={effClips}
                durationMs={max}
                selectedClipId={selectedClipId}
                onSeek={onSeek}
                showMeasureLines={showMeasureLines}
              />

              {/* Outside-trim dim */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-slate-50/60 dark:bg-slate-950/65 pointer-events-none z-[15]"
                style={{ width: `${startPct}%` }}
              />
              <div
                aria-hidden
                className="absolute inset-y-0 right-0 bg-slate-50/60 dark:bg-slate-950/65 pointer-events-none z-[15]"
                style={{ width: `${100 - endPct}%` }}
              />

              {/* Clip hit zones */}
              {effClips.map((clip) => {
                const isBeingDragged = drag?.clipId === clip.id
                const previewStart   = previewMap.get(clip.id)
                const offsetMs       = previewStart !== undefined ? previewStart - clip.startMs : 0
                return (
                  <ClipOverlay
                    key={clip.id}
                    clip={clip}
                    leftPct={((clip.startMs - min) / range) * 100}
                    widthPct={((clip.endMs - clip.startMs) / range) * 100}
                    selected={clip.id === selectedClipId}
                    draggable={!!onMoveClip}
                    isBeingDragged={isBeingDragged}
                    dragTranslatePx={isBeingDragged ? draggedTranslatePx : 0}
                    offsetMsToView={offsetMs}
                    range={range}
                    pxPerMs={pxPerMs}
                    anyDragging={!!drag}
                    onMouseDown={onMoveClip && !clip.locked ? beginClipDrag(clip) : undefined}
                  />
                )
              })}

              {drag && (() => {
                const c = effClips.find(x => x.id === drag.clipId)
                if (!c) return null
                const ghostLeftPct  = ((c.startMs - min) / range) * 100
                const ghostWidthPct = ((c.endMs - c.startMs) / range) * 100
                return (
                  <div
                    aria-hidden
                    className="fm-ghost absolute top-1 bottom-1 rounded-lg border-2 border-dashed border-slate-400/70 dark:border-slate-500/70 pointer-events-none z-[4]"
                    style={{
                      left:  `calc(${ghostLeftPct}% + 1px)`,
                      width: `calc(${ghostWidthPct}% - 2px)`,
                    }}
                  />
                )
              })()}

              {drag && placeholder && (() => {
                const phLeftPct  = ((placeholder.startMs - min) / range) * 100
                const phWidthPct = ((placeholder.endMs - placeholder.startMs) / range) * 100
                return (
                  <div
                    aria-hidden
                    className={[
                      'absolute top-1 bottom-1 rounded-lg pointer-events-none z-[6] fm-placeholder bg-blue-500/10 dark:bg-blue-400/10',
                      overPlaceholder ? 'fm-placeholder-over' : '',
                    ].join(' ')}
                    style={{
                      left:  `calc(${phLeftPct}% + 1px)`,
                      width: `calc(${phWidthPct}% - 2px)`,
                      transition: 'left 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                )
              })()}

              {playVisible && (
                <div
                  onMouseDown={onSeek ? onPlayheadMouseDown : undefined}
                  className={[
                    'absolute top-0 bottom-0 w-3 -ml-[6px] z-[19] group',
                    onSeek
                      ? scrubbing
                        ? 'pointer-events-auto cursor-grabbing'
                        : 'pointer-events-auto cursor-ew-resize'
                      : 'pointer-events-none',
                  ].join(' ')}
                  style={{ left: `${playPct}%`, touchAction: 'none' }}
                  aria-label="Playhead"
                  role="slider"
                >
                  <div
                    aria-hidden
                    className={[
                      'absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors',
                      scrubbing
                        ? 'bg-blue-300'
                        : playbackActive ? 'bg-white' : 'bg-white/85',
                    ].join(' ')}
                    style={{
                      boxShadow: scrubbing
                        ? '0 0 10px rgba(147,197,253,0.9), 0 0 18px rgba(59,130,246,0.6)'
                        : playbackActive
                          ? '0 0 8px rgba(255,255,255,0.85), 0 0 14px rgba(96,165,250,0.5)'
                          : '0 0 4px rgba(255,255,255,0.4)',
                    }}
                  />
                  <div
                    aria-hidden
                    className={[
                      'absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow transition-transform',
                      scrubbing
                        ? 'scale-125 ring-2 ring-blue-400 shadow-blue-500/60'
                        : playbackActive
                          ? 'ring-2 ring-blue-300/60 group-hover:scale-110'
                          : 'group-hover:scale-110',
                    ].join(' ')}
                  />
                </div>
              )}

              <TrimHandle side="left"  pct={startPct} onMouseDown={trim.begin('start')} dragging={trim.active === 'start'} snapping={trim.snappedSide === 'start'} />
              <TrimHandle side="right" pct={endPct}   onMouseDown={trim.begin('end')}   dragging={trim.active === 'end'}   snapping={trim.snappedSide === 'end'} />
            </div>
          </div>
        </div>

        {onAddSegment && (
          <button
            type="button"
            onClick={onAddSegment}
            title={addSegmentLabel}
            aria-label={addSegmentLabel}
            className="self-end shrink-0 w-11 h-24 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-500/70 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-500/5 active:scale-[0.97] transition-all"
          >
            <PlusCircleIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {menu && clipActions && (
        <ClipContextMenu
          x={menu.x} y={menu.y}
          atMs={menu.atMs}
          splitAtMs={menu.splitAtMs}
          clipHere={menu.clipHere}
          hasClipboard={!!hasClipboard}
          onClose={() => setMenu(null)}
          actions={clipActions}
        />
      )}
    </div>
  )
}
