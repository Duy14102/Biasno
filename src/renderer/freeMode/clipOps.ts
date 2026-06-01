// Pure operations on a FreeSnapshot — the data layer of the Free-Mode
// editor.  Every exported function takes a snapshot and returns a NEW
// snapshot.  No mutations.  If the operation is a no-op (invalid position,
// locked clip refused, would violate MIN_CLIP_MS, etc.) it returns the
// input snapshot by identity — callers can `if (next !== prev)` to know
// whether to push onto the history stack.
//
// Invariants every returned snapshot honours:
//   • clips sorted by startMs ascending
//   • clips never overlap
//   • every clip's [startMs, endMs] sits inside [trimStartMs, trimEndMs]
//   • every clip has width ≥ MIN_CLIP_MS
//
// "Empty clips[]" is the default state — semantically equivalent to one
// implicit clip spanning [trimStartMs, trimEndMs].  The first explicit
// edit materialises that into a concrete clip array.

import type { Clip, FreeSnapshot, RecordedNote } from './types'
import type { PedalEvent } from '@/types'

export const MIN_CLIP_MS = 80

// ── Pedal-timeline helpers ──────────────────────────────────────────────────
// Pedal events live on the recording clock (ms), same as notes, so the
// time-shifting clip ops must move them in lock-step or the damper desyncs
// from the notes after an edit.

// Delete ripple: drop events inside the removed span, shift later ones left.
function pedalAfterDelete(events: PedalEvent[] | undefined, start: number, end: number, span: number): PedalEvent[] | undefined {
  if (!events) return events
  return events
    .filter(e => e.time < start || e.time > end)
    .map(e => e.time > end ? { ...e, time: e.time - span } : e)
}

// Insert ripple: shift events at/after the insert point right by width.
function pedalAfterInsert(events: PedalEvent[] | undefined, insert: number, width: number): PedalEvent[] | undefined {
  if (!events) return events
  return events.map(e => e.time >= insert ? { ...e, time: e.time + width } : e)
}

let _idCounter = 0
const nextId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}-${(_idCounter++).toString(36)}`

const newClipId       = (): string => nextId('c')
const newPastedNoteId = (): string => nextId('p')

export function makeClip(startMs: number, endMs: number, init: Partial<Clip> = {}): Clip {
  return {
    id:      init.id ?? newClipId(),
    startMs,
    endMs,
    volume:  init.volume  ?? 1,
    locked:  init.locked  ?? false,
    comment: init.comment,
  }
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

const sortClips = (clips: Clip[]): Clip[] =>
  clips.slice().sort((a, b) => a.startMs - b.startMs)

// ── Read-side helpers ──────────────────────────────────────────────────────

export type ClipView = Pick<FreeSnapshot, 'clips' | 'trimStartMs' | 'trimEndMs'>

// Materialise the implicit single-clip default when clips[] is empty.
// Always returns at least one clip as long as the trim window has width.
export function effectiveClips(s: ClipView): Clip[] {
  if (s.clips.length > 0) return s.clips
  if (s.trimEndMs <= s.trimStartMs) return []
  return [makeClip(s.trimStartMs, s.trimEndMs, { id: 'default' })]
}

// Clip containing `ms`, or null if `ms` is in a gap / outside trim.
//
// At a boundary between two touching clips (a prior split's cut point) the
// RIGHT clip wins.  Notes whose onset is exactly on the boundary then live
// inside a clip whose endMs > onset, so their audible window has non-zero
// duration.  First-match (left-wins) iteration silently dropped them.
export function clipAt(s: ClipView, ms: number): Clip | null {
  const clips = effectiveClips(s)
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i]
    if (ms >= c.startMs && ms <= c.endMs) return c
  }
  return null
}

// End of the CONTIGUOUS chunk of clips that contains `ms`.  Two clips are
// "touching" when one's startMs <= the previous one's endMs (the split-
// boundary case is startMs === previous.endMs).  Returns null when `ms`
// lies in a gap or outside every clip.
//
// This is the canonical "how far does the audio play through" check.  A
// note whose onset lands in a clip plays through every subsequent touching
// clip until it either hits a gap or reaches its own natural endMs.  Split
// produces touching clips → chunk extends through both → audible duration
// is the same as the pre-split single-clip case (waveform invariant).
// Delete produces a gap → chunk breaks at the deletion → audio correctly
// stops there.
export function chunkEndAt(clips: readonly Clip[], ms: number): number | null {
  const sorted = clips.slice().sort((a, b) => a.startMs - b.startMs)
  let onsetIdx = -1
  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i]
    if (ms >= c.startMs && ms <= c.endMs) { onsetIdx = i; break }
  }
  if (onsetIdx === -1) return null
  let end = sorted[onsetIdx].endMs
  for (let i = onsetIdx + 1; i < sorted.length; i++) {
    if (sorted[i].startMs <= end) end = Math.max(end, sorted[i].endMs)
    else break
  }
  return end
}

// ── Materialise / replace helpers ──────────────────────────────────────────

// Materialise the implicit "the whole recording is one clip" default into a
// concrete clip spanning [0, durationMs].  We deliberately span the FULL
// recording (not the current trim window) so a subsequent trim-back keeps
// every note retrievable by expanding the trim again.
function materialise(s: FreeSnapshot): FreeSnapshot {
  if (s.clips.length > 0) return s
  if (s.durationMs <= 0) return s
  return { ...s, clips: [makeClip(0, s.durationMs)] }
}

// Look up the clip containing `ms` in an already-materialised snapshot.
// Distinct from clipAt() which queries via effectiveClips (synthetic ids
// for the implicit default).  Edit operations should always materialise
// FIRST and use this so the returned clip's id matches mat.clips entries.
//
// Boundary semantics match clipAt — at a split's touching point, the RIGHT
// clip wins (so chained splits behave correctly).
function findClipAt(s: FreeSnapshot, ms: number): Clip | null {
  for (let i = s.clips.length - 1; i >= 0; i--) {
    const c = s.clips[i]
    if (ms >= c.startMs && ms <= c.endMs) return c
  }
  return null
}

// ── Split ──────────────────────────────────────────────────────────────────
//
// Cut the clip at `ms` into two clips that TOUCH at the cut point.  Notes
// whose audio range crosses the cut AND are long enough to have audible
// sustain are data-split (left half ends at the cut, right half starts at
// cut+1).  Shorter notes stay whole — their onset decides which clip owns
// them.  No clever boundary snapping: the user is responsible for placing
// the playhead.
export function splitAt(s: FreeSnapshot, ms: number): FreeSnapshot {
  const mat = materialise(s)
  const target = findClipAt(mat, ms)
  if (!target || target.locked) return s

  const point = Math.round(ms)
  if (point - target.startMs < MIN_CLIP_MS) return s
  if (target.endMs - point   < MIN_CLIP_MS) return s

  // Split is a PURE CLIP-ARRAY operation.  We deliberately do not touch
  // notes — the recorded audio is preserved byte-for-byte so the waveform
  // visual is guaranteed identical before and after the split.  A
  // sustained note that crosses the cut stays whole; its onset decides
  // which clip owns it (deleting that clip drops the entire note).
  //
  // This trade-off favours visual stability over the ability to delete
  // half a held tone — any envelope tweak we'd add to support that ends
  // up changing the buffer and shifting bars.
  const nextClips = mat.clips.flatMap<Clip>((c) => {
    if (c.id !== target.id) return [c]
    return [
      makeClip(c.startMs, point,  { volume: c.volume, locked: c.locked, comment: c.comment }),
      makeClip(point,     c.endMs, { volume: c.volume, locked: c.locked }),
    ]
  })
  return { ...mat, clips: sortClips(nextClips) }
}

// ── Delete (ripple) ────────────────────────────────────────────────────────
//
// Remove the clip at `ms`.  Clips and notes located AFTER the removed clip
// shift leftward by the deleted clip's width so the timeline compacts.
// durationMs and trimEndMs shrink by the same amount.
//
// Note re-anchoring (the bit that makes "split + delete one half preserves
// the other half's audio" work):
//   • Note onset BEFORE target: keep as-is.  Its tail extending into the
//     deleted clip is naturally clamped at playback time by chunkEndAt.
//   • Note onset AFTER target: shift left by span.
//   • Note onset INSIDE target, audio ends inside target: drop.
//   • Note onset INSIDE target, audio extends past target: RE-ANCHOR.  The
//     audible portion that lives in the next surviving clip is preserved —
//     new startMs = target.endMs (snapped to where the surviving clip
//     begins), shifted left by span.  Playback owns the envelope; the
//     piano-roll preview just draws the rectangle, so no extra phase
//     bookkeeping lives here.
export function deleteAt(s: FreeSnapshot, ms: number): FreeSnapshot {
  const mat = materialise(s)
  const target = findClipAt(mat, ms)
  if (!target || target.locked) return s
  const span = target.endMs - target.startMs

  const survivors = mat.clips.filter(c => c.id !== target.id)
  const inSurvivor = (sMs: number): boolean =>
    survivors.some(c => sMs >= c.startMs && sMs <= c.endMs)
  const hasSurvivorAfter = survivors.some(c => c.startMs >= target.endMs)

  // POST-delete clip layout, computed once up front so we can clamp each
  // surviving note's endMs to its real audible reach.  Without this clamp
  // a note whose tail was already past the surviving region carries a
  // PHANTOM endMs; a later paste/clone that inserts a touching clip
  // extends chunkEndAt past the surviving region and the phantom tail
  // reappears, drawing as a second disconnected note segment next to
  // the actual copy.
  const clips = sortClips(survivors.map(c =>
    c.startMs >= target.endMs ? { ...c, startMs: c.startMs - span, endMs: c.endMs - span } : c,
  ))

  const clampToChunk = (n: RecordedNote): RecordedNote => {
    const ce = chunkEndAt(clips, n.startMs) ?? n.endMs
    return n.endMs > ce ? { ...n, endMs: ce } : n
  }

  const notes = mat.notes.flatMap<RecordedNote>((n) => {
    const onsetInTarget = n.startMs >= target.startMs && n.startMs <= target.endMs
    const onsetAfter    = n.startMs > target.endMs

    if (onsetAfter) {
      return [clampToChunk({ ...n, startMs: n.startMs - span, endMs: n.endMs - span })]
    }

    if (onsetInTarget) {
      // Boundary note from a prior split — onset also lives in a survivor.
      if (inSurvivor(n.startMs)) {
        return [clampToChunk({ ...n, startMs: n.startMs - span, endMs: n.endMs - span })]
      }
      // Note's audio extends past the deleted clip's end into a surviving
      // clip — re-anchor to the surviving region.
      if (n.endMs > target.endMs && hasSurvivorAfter) {
        return [clampToChunk({
          ...n,
          startMs: target.startMs,     // = target.endMs - span (where the next clip lands after ripple)
          endMs:   n.endMs - span,
        })]
      }
      // Note entirely inside the deleted clip → drop.
      return []
    }

    // Onset before target — sever any phantom tail past the surviving chunk.
    return [clampToChunk(n)]
  })

  return {
    ...mat,
    notes:      notes.sort((a, b) => a.startMs - b.startMs),
    clips,
    pedalEvents: pedalAfterDelete(mat.pedalEvents, target.startMs, target.endMs, span),
    durationMs: Math.max(0, mat.durationMs - span),
    trimEndMs:  Math.max(mat.trimStartMs, mat.trimEndMs - span),
  }
}

// ── Volume / Lock / Comment ────────────────────────────────────────────────

function patchClip(
  s: FreeSnapshot, ms: number, fn: (c: Clip) => Clip | null,
): FreeSnapshot {
  const mat = materialise(s)
  const target = findClipAt(mat, ms)
  if (!target) return s
  const updated = fn(target)
  if (updated === null) return s
  return { ...mat, clips: sortClips(mat.clips.map(c => c.id === target.id ? updated : c)) }
}

export function setVolumeAt(s: FreeSnapshot, ms: number, volume: number): FreeSnapshot {
  return patchClip(s, ms, c => c.locked ? null : { ...c, volume: clamp(volume, 0, 2) })
}

export function toggleLockAt(s: FreeSnapshot, ms: number): FreeSnapshot {
  return patchClip(s, ms, c => ({ ...c, locked: !c.locked }))
}

export function setCommentAt(s: FreeSnapshot, ms: number, comment: string): FreeSnapshot {
  return patchClip(s, ms, (c) => {
    if (c.locked) return null
    const trimmed = comment.trim()
    return { ...c, comment: trimmed || undefined }
  })
}

// ── Copy / Paste / Clone ───────────────────────────────────────────────────

// Notes audibly visible in `source` come from two places:
//   (a) Onsets that sit inside source's [startMs, endMs).
//   (b) Notes whose onset lives in an earlier clip but whose audible tail
//       extends into source because the two clips touch (chunkEndAt rule
//       — same one the renderer + playback engine use).
// Both kinds need to be reproduced when copying/cloning, otherwise the
// destination clip's piano-roll looks different from the source it was
// duplicated from (the user-visible bug: a clone of a clip that only
// holds a sustained-note tail comes out empty).
function duplicateNotes(
  notes: readonly RecordedNote[],
  clips: readonly Clip[],
  source: Clip,
  destStartMs: number,
): RecordedNote[] {
  const offset = destStartMs - source.startMs
  const out: RecordedNote[] = []
  for (const n of notes) {
    const chunkEnd   = chunkEndAt(clips, n.startMs) ?? n.endMs
    const audibleEnd = Math.min(n.endMs, chunkEnd)
    if (audibleEnd <= source.startMs || n.startMs >= source.endMs) continue

    if (n.startMs >= source.startMs) {
      // (a) Onset inside source.  Clamp endMs to source.endMs so the
      // copy doesn't carry a phantom tail past the destination clip — if
      // we just `n.endMs + offset` here, a sustained-note copy ends up
      // longer than the dest clip, and the next paste/clone that adds a
      // touching clip after dest resurrects that phantom as a second
      // visible note segment.  The source clip itself only shows up to
      // source.endMs visually, so the copy stops there too.
      const visibleEnd = Math.min(n.endMs, source.endMs)
      out.push({
        ...n,
        id:      newPastedNoteId(),
        startMs: n.startMs + offset,
        endMs:   visibleEnd + offset,
      })
    } else {
      // (b) Tail extension — create a fresh note that covers the audible
      // window inside source, anchored to the destination clip's start.
      // Same pitch + velocity so the visual matches.  Audio loses the
      // original sustained continuation (this attacks afresh) but the
      // clip the user duplicated already only carried the tail visually,
      // so the trade is "see what you cloned" over the inherited sustain.
      const tailEnd = Math.min(audibleEnd, source.endMs)
      out.push({
        ...n,
        id:      newPastedNoteId(),
        startMs: source.startMs + offset,
        endMs:   tailEnd         + offset,
      })
    }
  }
  return out
}

function shiftIfPast<T extends { startMs: number; endMs: number }>(
  item: T, threshold: number, by: number,
): T {
  return item.startMs >= threshold
    ? { ...item, startMs: item.startMs + by, endMs: item.endMs + by }
    : item
}

// Largest gap that contains `ms` and is at least `w` wide.  Returns null if
// `ms` is inside a clip or no gap is big enough.
function findGapAt(s: FreeSnapshot, ms: number, w: number): { startMs: number; endMs: number } | null {
  const clips = sortClips(effectiveClips(s))
  let gapStart = s.trimStartMs
  for (const c of clips) {
    if (ms < c.startMs) {
      const gapEnd = c.startMs
      if (ms >= gapStart && ms <= gapEnd && gapEnd - gapStart >= w) {
        return { startMs: gapStart, endMs: gapEnd }
      }
      gapStart = c.endMs
    } else if (ms <= c.endMs) {
      return null
    } else {
      gapStart = Math.max(gapStart, c.endMs)
    }
  }
  const gapEnd = s.trimEndMs
  if (ms >= gapStart && ms <= gapEnd && gapEnd - gapStart >= w) {
    return { startMs: gapStart, endMs: gapEnd }
  }
  return null
}

function rippleInsert(s: FreeSnapshot, source: Clip, insertStartMs: number): FreeSnapshot {
  const width  = source.endMs - source.startMs
  const mat    = materialise(s)
  const insert = Math.round(insertStartMs)

  const shiftedClips = mat.clips.map(c => shiftIfPast(c, insert, width))
  const shiftedNotes = mat.notes.map(n => shiftIfPast(n, insert, width))

  const dup = makeClip(insert, insert + width, {
    volume:  source.volume,
    locked:  source.locked,
    comment: source.comment,
  })
  // Compute dup notes against the PRE-RIPPLE clip layout — that's where
  // chunkEndAt knows which clips were touching source before we inserted.
  const dupNotes = duplicateNotes(mat.notes, mat.clips, source, dup.startMs)

  const trimEndMs = insert <= mat.trimEndMs
    ? mat.trimEndMs + width
    : Math.max(mat.trimEndMs, dup.endMs)

  return {
    ...mat,
    clips:      sortClips([...shiftedClips, dup]),
    notes:      [...shiftedNotes, ...dupNotes].sort((a, b) => a.startMs - b.startMs),
    pedalEvents: pedalAfterInsert(mat.pedalEvents, insert, width),
    durationMs: Math.max(mat.durationMs + width, dup.endMs),
    trimEndMs,
  }
}

// Three placement rules, in priority:
//   1. Cursor INSIDE a clip → ripple-insert immediately after the host clip.
//   2. Cursor in a gap WIDE ENOUGH → fit-to-gap, centred on cursor.
//   3. Anywhere else → ripple-insert at the cursor.
export function pasteAt(s: FreeSnapshot, source: Clip, ms: number): FreeSnapshot {
  const width = source.endMs - source.startMs
  if (width < MIN_CLIP_MS) return s

  const host = clipAt(s, ms)
  if (host) return rippleInsert(s, source, host.endMs)

  const gap = findGapAt(s, ms, width)
  if (gap) {
    const newStart = Math.round(clamp(ms - width / 2, gap.startMs, gap.endMs - width))
    const mat = materialise(s)
    const dup = makeClip(newStart, newStart + width, {
      volume:  source.volume,
      locked:  source.locked,
      comment: source.comment,
    })
    const dupNotes = duplicateNotes(mat.notes, mat.clips, source, dup.startMs)
    return {
      ...mat,
      clips: sortClips([...mat.clips, dup]),
      notes: [...mat.notes, ...dupNotes].sort((a, b) => a.startMs - b.startMs),
    }
  }

  return rippleInsert(s, source, ms)
}

// ── Move (reorder by slot) ─────────────────────────────────────────────────
//
// Move `clipId` to position `targetSlot` in the without-dragged array.  The
// final layout has every clip touching its neighbours starting from
// trimStartMs (Premiere "ripple insert").  Notes ride along with their
// owning clip.  Locked clips refuse.  A drop on the original slot is a
// no-op.
export function moveToSlot(s: FreeSnapshot, clipId: string, targetSlot: number): FreeSnapshot {
  const mat    = materialise(s)
  const sorted = sortClips(mat.clips)
  const fromIdx = sorted.findIndex(c => c.id === clipId)
  if (fromIdx < 0) return s
  const moved = sorted[fromIdx]
  if (moved.locked) return s

  const without  = [...sorted.slice(0, fromIdx), ...sorted.slice(fromIdx + 1)]
  const insertAt = clamp(targetSlot, 0, without.length)
  if (insertAt === fromIdx) return s

  const reordered = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)]

  const shifts: Map<string, number> = new Map()
  const repositioned: Clip[] = []
  let cursor = mat.trimStartMs
  for (const c of reordered) {
    const w = c.endMs - c.startMs
    shifts.set(c.id, cursor - c.startMs)
    repositioned.push({ ...c, startMs: cursor, endMs: cursor + w })
    cursor += w
  }

  // Right-wins at clip boundaries — same convention as clipAt / chunkEndAt /
  // findClipAt.  Without this, a note whose onset sits exactly on a touching-
  // clip boundary (common when a paste lands adjacent to an existing clip, or
  // a split puts a note's onset at the cut) matches the LEFT clip in ascending
  // iteration.  If the left clip's shift is 0 and the right clip moved, the
  // note gets stranded at the old position, outside any clip — manifests as
  // "B(1) is empty after dragging AB(2) onto it", with the duplicate note
  // floating past durationMs.
  const notes = mat.notes.map((n) => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const oc = sorted[i]
      if (n.startMs >= oc.startMs && n.startMs <= oc.endMs) {
        const delta = shifts.get(oc.id) ?? 0
        return delta === 0 ? n : { ...n, startMs: n.startMs + delta, endMs: n.endMs + delta }
      }
    }
    return n
  })

  // Pedal events ride with the clip they fall inside (same per-clip delta as
  // notes); events in a gap stay put.
  const pedalEvents = mat.pedalEvents?.map((e) => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const oc = sorted[i]
      if (e.time >= oc.startMs && e.time <= oc.endMs) {
        const delta = shifts.get(oc.id) ?? 0
        return delta === 0 ? e : { ...e, time: e.time + delta }
      }
    }
    return e
  })

  return {
    ...mat,
    clips:      repositioned,
    notes:      notes.sort((a, b) => a.startMs - b.startMs),
    pedalEvents,
    durationMs: Math.max(mat.durationMs, cursor),
    trimEndMs:  Math.max(mat.trimEndMs, cursor),
  }
}

// ── Trim window ────────────────────────────────────────────────────────────

export function setTrimStart(s: FreeSnapshot, ms: number): FreeSnapshot {
  const clamped = Math.max(0, Math.min(ms, s.trimEndMs - 50))
  if (clamped === s.trimStartMs) return s
  return { ...s, trimStartMs: clamped }
}

export function setTrimEnd(s: FreeSnapshot, ms: number): FreeSnapshot {
  const clamped = Math.min(s.durationMs, Math.max(ms, s.trimStartMs + 50))
  if (clamped === s.trimEndMs) return s
  return { ...s, trimEndMs: clamped }
}
