// Coordinator for the Free-Mode timeline.  Owns nothing complex itself —
// every sub-feature lives in a focused hook or sub-component:
//
//   • TimelineWaveform  — Canvas2D waveform painted from peaks
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
import ClipOverlay from './ClipOverlay'
import TimelineRuler from './TimelineRuler'
import TimelineWaveform from './TimelineWaveform'
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
}

export default function TrimRange({
  min, max, startMs, endMs, notes,
  onDraftStart, onDraftEnd, onCommitStart, onCommitEnd,
  formatMs, minGap = 50,
  playbackMs, playbackActive, onSeek,
  clips, hasClipboard, snapshotForMenu, clipActions,
  onAddSegment, addSegmentLabel,
  onMoveClip,
}: Props): React.JSX.Element {
  const range   = Math.max(1, max - min)
  const startPct = ((startMs - min) / range) * 100
  const endPct   = ((endMs   - min) / range) * 100

  const { pxPerMs, scaledMinWidth, containerRef: scrollContainerRef } = useTimelineScale(range, max)

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

  // ── Playhead pct ──────────────────────────────────────────────────────
  const playPct = playbackMs !== undefined ? ((playbackMs - min) / range) * 100 : 0
  const playVisible =
    playbackMs !== undefined &&
    playbackMs >= startMs &&
    playbackMs <= endMs

  return (
    <div className="flex flex-col gap-2 select-none">
      <style>{TIMELINE_STYLES}</style>
      <div className="flex items-stretch gap-3">

        <div ref={scrollContainerRef} className="fm-timeline-scroll flex-1 min-w-0 overflow-x-auto">
          <div className="flex flex-col gap-1.5" style={{ minWidth: scaledMinWidth }}>

            <div className="relative h-4 text-[11px] font-mono tabular-nums">
              <span
                className="absolute -translate-x-1/2 px-1 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold"
                style={{ left: `${startPct}%` }}
              >
                {formatMs(startMs)}
              </span>
              <span
                className="absolute -translate-x-1/2 px-1 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold"
                style={{ left: `${endPct}%` }}
              >
                {formatMs(endMs)}
              </span>
            </div>

            <TimelineRuler range={range} />

            <div
              ref={trackRef}
              onContextMenu={onContextMenu}
              className="relative h-24 rounded-xl bg-slate-200/80 dark:bg-slate-950 overflow-hidden"
            >
              <TimelineWaveform
                notes={notes}
                clips={effClips}
                durationMs={max}
                selectedClipId={selectedClipId}
                onSeek={onSeek}
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
                  aria-hidden
                  className={[
                    'absolute top-0 bottom-0 w-0.5 -ml-px pointer-events-none z-[18] transition-colors',
                    playbackActive ? 'bg-white' : 'bg-white/85',
                  ].join(' ')}
                  style={{
                    left: `${playPct}%`,
                    boxShadow: playbackActive
                      ? '0 0 8px rgba(255,255,255,0.85), 0 0 14px rgba(96,165,250,0.5)'
                      : '0 0 4px rgba(255,255,255,0.4)',
                  }}
                >
                  <div className={[
                    'absolute -top-1 -left-[5px] w-3 h-3 rounded-full bg-white shadow',
                    playbackActive ? 'ring-2 ring-blue-300/60' : '',
                  ].join(' ')} />
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
