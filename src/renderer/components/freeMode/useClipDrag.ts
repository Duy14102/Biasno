// Hook driving the drag-to-reorder UX on the timeline.  Distinguishes a
// real drag from a quick click (so click-to-seek still works), tracks the
// cursor's recording-ms, computes which "slot" the dragged clip would land
// in, and rolls a requestAnimationFrame loop that auto-scrolls the timeline
// horizontally while the cursor sits near a viewport edge.
//
// The hook is purely behavioural — it does not render anything.  Consumers
// read `state` to draw the floating preview, the destination placeholder,
// and the translated positions of other clips.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip } from '@/freeMode'

// Pixels of cursor movement after mousedown before we commit to a drag.
// Below this the gesture is treated as a click (scrub).
const DRAG_THRESHOLD_PX = 4

// Edge zone within which the timeline auto-scrolls while a drag is active.
const AUTOSCROLL_EDGE_PX = 80
// Max scroll velocity at the very edge (px per animation frame).
const AUTOSCROLL_MAX_PX_PER_FRAME = 14
// Smallest velocity we apply (so we don't stutter at 0.0001 px/frame).
const AUTOSCROLL_MIN_PX_PER_FRAME = 0.6

export interface DragState {
  clipId:        string
  // Width of the dragged clip in ms — used to size the placeholder.
  widthMs:       number
  // Cursor's current ms position on the timeline.
  cursorMs:      number
  // Original startMs of the dragged clip at drag-start — drives the
  // dragged element's translateX while the cursor follows it.
  originalStart: number
  // Mouse offset within the clip, in ms (so the clip doesn't snap its
  // left edge to the cursor — it carries on at the same grab point).
  offsetMs:      number
  // Slot to drop into, in the WITHOUT-dragged array.  null until the cursor
  // is inside the timeline track.
  dropSlot:      number | null
}

interface Args {
  msAtClientX:        (x: number) => number
  // Ref to the timeline's scroll container.  Used to auto-scroll the
  // timeline horizontally when the cursor is dragged near its edges.
  // Accepts a ref (not a raw element) so the latest .current is read on
  // every mousemove, not pinned at first render.
  scrollContainer:    React.RefObject<HTMLElement | null>
  clips:              Clip[]
  onDrop:             (clipId: string, slot: number) => void
}

interface ReturnApi {
  state:          DragState | null
  // Attach to a clip's mousedown.  Returns whether the gesture begins a
  // drag-candidate (caller may still want to invoke its click handler
  // separately — we only fire onClickFallback if the gesture didn't pass
  // the drag threshold by the time the mouse goes up).
  beginDragMaybe: (e: React.MouseEvent, clip: Clip, onClickFallback?: (clientX: number) => void) => void
}

export function useClipDrag({ msAtClientX, scrollContainer, clips, onDrop }: Args): ReturnApi {
  const [state, setState] = useState<DragState | null>(null)
  const stateRef = useRef<DragState | null>(null)
  useEffect(() => { stateRef.current = state }, [state])

  // Latest values in refs so the global mousemove/up listeners stay stable.
  const msAtClientXRef = useRef(msAtClientX)
  useEffect(() => { msAtClientXRef.current = msAtClientX }, [msAtClientX])
  const clipsRef = useRef(clips)
  useEffect(() => { clipsRef.current = clips }, [clips])
  const onDropRef = useRef(onDrop)
  useEffect(() => { onDropRef.current = onDrop }, [onDrop])

  // Auto-scroll RAF loop.  `edgeVelRef` is updated by mousemove; the loop
  // applies it to scrollLeft each frame so the speed feels smooth and the
  // scroll keeps going even when the user stops moving (Premiere behaviour).
  const edgeVelRef = useRef(0)
  const rafRef     = useRef<number | null>(null)
  const lastClientXRef = useRef(0)

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    edgeVelRef.current = 0
  }, [])

  const tick = useCallback(() => {
    const el = scrollContainer.current
    if (!el || stateRef.current === null) { stopRaf(); return }
    const v = edgeVelRef.current
    if (v !== 0) {
      const prev = el.scrollLeft
      el.scrollLeft = prev + v
      // After the scroll moves, the cursorMs at the same screen X changes
      // — refresh it so the placeholder follows immediately, not next move.
      if (el.scrollLeft !== prev) {
        const cMs = msAtClientXRef.current(lastClientXRef.current)
        setState((s) => s ? { ...s, cursorMs: cMs, dropSlot: detectDropSlot(clipsRef.current, s.clipId, cMs) } : s)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf, scrollContainer])

  const updateAutoScroll = useCallback((clientX: number) => {
    const el = scrollContainer.current
    if (!el) { edgeVelRef.current = 0; return }
    const r = el.getBoundingClientRect()
    const fromLeft  = clientX - r.left
    const fromRight = r.right  - clientX
    let v = 0
    if (fromLeft < AUTOSCROLL_EDGE_PX) {
      const t = 1 - Math.max(0, fromLeft) / AUTOSCROLL_EDGE_PX
      v = -Math.max(AUTOSCROLL_MIN_PX_PER_FRAME, t * AUTOSCROLL_MAX_PX_PER_FRAME)
    } else if (fromRight < AUTOSCROLL_EDGE_PX) {
      const t = 1 - Math.max(0, fromRight) / AUTOSCROLL_EDGE_PX
      v = Math.max(AUTOSCROLL_MIN_PX_PER_FRAME, t * AUTOSCROLL_MAX_PX_PER_FRAME)
    }
    edgeVelRef.current = v
    if (v !== 0 && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [tick, scrollContainer])

  // ── Begin / move / up ──────────────────────────────────────────────────
  const beginDragMaybe = useCallback(
    (e: React.MouseEvent, clip: Clip, onClickFallback?: (clientX: number) => void) => {
      if (e.button !== 0) return
      if (clip.locked) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startY = e.clientY
      const cursorMs0 = msAtClientX(startX)
      const offsetMs  = cursorMs0 - clip.startMs
      let dragging   = false
      let didFallback = false

      const onMove = (ev: MouseEvent) => {
        lastClientXRef.current = ev.clientX
        if (!dragging) {
          const dx = ev.clientX - startX
          const dy = ev.clientY - startY
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
          // Commit to a drag now.
          dragging = true
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'
          const widthMs = clip.endMs - clip.startMs
          const initialDrop = detectDropSlot(clipsRef.current, clip.id, msAtClientXRef.current(ev.clientX))
          const initial: DragState = {
            clipId:        clip.id,
            widthMs,
            cursorMs:      msAtClientXRef.current(ev.clientX),
            originalStart: clip.startMs,
            offsetMs,
            dropSlot:      initialDrop,
          }
          stateRef.current = initial
          setState(initial)
        }
        const cMs = msAtClientXRef.current(ev.clientX)
        const slot = detectDropSlot(clipsRef.current, clip.id, cMs)
        stateRef.current = stateRef.current && { ...stateRef.current, cursorMs: cMs, dropSlot: slot }
        setState((s) => s ? { ...s, cursorMs: cMs, dropSlot: slot } : s)
        updateAutoScroll(ev.clientX)
      }

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup',   onUp)
        if (!dragging) {
          if (!didFallback && onClickFallback) { didFallback = true; onClickFallback(ev.clientX) }
          return
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        stopRaf()
        const finalState = stateRef.current
        stateRef.current = null
        setState(null)
        if (finalState && finalState.dropSlot !== null) {
          // findIndex over current clips lets us pass slot through the
          // moveClipToSlot contract: insertion in the without-dragged array.
          onDropRef.current(finalState.clipId, finalState.dropSlot)
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup',   onUp)
    },
    [msAtClientX, updateAutoScroll, stopRaf],
  )

  useEffect(() => () => {
    // Hard cleanup if unmounted mid-drag.
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    stopRaf()
  }, [stopRaf])

  return { state, beginDragMaybe }
}

// Compute which "drop slot" the cursor would target if the dragged clip
// were inserted into the WITHOUT-dragged array right now.  Slots are
// indexed 0..N where N = without.length (so 0 = before any other clip and
// N = after the last).
//
// Rules:
//   • Cursor left of the first remaining clip → 0
//   • Cursor right of the last remaining clip → N
//   • Inside a clip → mid-point divides "before that clip" / "after it"
//   • In a gap between adjacent clips → after the clip on the left
export function detectDropSlot(allClips: Clip[], draggedId: string, cursorMs: number): number {
  const remaining = allClips.filter(c => c.id !== draggedId).sort((a, b) => a.startMs - b.startMs)
  if (remaining.length === 0) return 0
  if (cursorMs < remaining[0].startMs) return 0
  for (let i = 0; i < remaining.length; i++) {
    const c = remaining[i]
    if (cursorMs >= c.startMs && cursorMs <= c.endMs) {
      const mid = (c.startMs + c.endMs) / 2
      return cursorMs < mid ? i : i + 1
    }
    const next = remaining[i + 1]
    if (next && cursorMs > c.endMs && cursorMs < next.startMs) {
      return i + 1
    }
  }
  return remaining.length
}

// Compute preview positions for OTHER clips during a drag.  Used by the
// caller to render translateX offsets on each remaining clip so they slide
// out of the way when the cursor sits over a drop slot.
//
// Returns a map of clip.id → previewStartMs.  Clips whose entry is absent
// from the map are at their original positions (no offset applied).
//
// When `dropSlot` is null we return an empty map so clips stay put.
export function computePreviewPositions(
  allClips: Clip[],
  draggedId: string,
  draggedWidthMs: number,
  dropSlot:    number | null,
  trimStartMs: number,
): Map<string, number> {
  const out = new Map<string, number>()
  if (dropSlot === null) return out
  const remaining = allClips.filter(c => c.id !== draggedId).sort((a, b) => a.startMs - b.startMs)

  // Touch-layout for [remaining[0..dropSlot-1], <gap>, remaining[dropSlot..]]
  // where <gap> is draggedWidthMs wide.  Each remaining clip's previewStart
  // is its index's slot start.
  let cursor = trimStartMs
  for (let i = 0; i < remaining.length; i++) {
    if (i === dropSlot) cursor += draggedWidthMs
    const c = remaining[i]
    if (c.startMs !== cursor) out.set(c.id, cursor)
    cursor += c.endMs - c.startMs
  }
  return out
}

// Compute the placeholder's ms range given the dropSlot and the (re-laid)
// remaining clips.
export function computePlaceholderRange(
  allClips:    Clip[],
  draggedId:   string,
  draggedWidthMs: number,
  dropSlot:    number,
  trimStartMs: number,
): { startMs: number; endMs: number } {
  const remaining = allClips.filter(c => c.id !== draggedId).sort((a, b) => a.startMs - b.startMs)
  let cursor = trimStartMs
  for (let i = 0; i < dropSlot && i < remaining.length; i++) {
    cursor += remaining[i].endMs - remaining[i].startMs
  }
  return { startMs: cursor, endMs: cursor + draggedWidthMs }
}
