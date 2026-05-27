// Snapshot history for the Free-Mode editor.  Owns the current FreeSnapshot
// plus an undo / redo stack and an in-memory clipboard.  Knows nothing about
// recording or playback — it's the state layer between the pure clipOps
// functions and the page/UI.
//
// Every clip edit goes through `commit(next)`.  When the returned snapshot
// is identity-equal to the previous one (op was a no-op) we skip the push
// so the undo stack doesn't accumulate empty entries.
//
// "Baseline collapse": when an edit returns the snapshot back to the
// recording's baseline (e.g. the user trimmed and then dragged the handle
// back), the past/future stacks are wiped so Undo/Redo grey out instead of
// pointing at no-op states.

import { useCallback, useRef, useState } from 'react'
import type { Clip, FreeSnapshot } from './types'

export const EMPTY_SNAPSHOT: FreeSnapshot = {
  notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0, clips: [],
}

export interface EditorApi {
  snapshot:  FreeSnapshot
  canUndo:   boolean
  canRedo:   boolean
  clipboard: Clip | null

  // Apply a pure transformer; commits only if the result is a new snapshot.
  apply:    (fn: (s: FreeSnapshot) => FreeSnapshot) => void
  // Undo / redo the last commit.
  undo:     () => void
  redo:     () => void
  // Replace the whole snapshot (library load, fresh recording).  Wipes
  // history; sets the new state as the baseline.
  reset:    (snap: FreeSnapshot) => void
  // Replace without history reset — used by the recorder when extending an
  // existing take so an undo right after Stop doesn't wipe the new notes.
  setBaseline: (snap: FreeSnapshot) => void

  // Clipboard
  copyClip: (clip: Clip) => void
}

// Two snapshots count as "matching the baseline" when trim AND clips are
// reference-equal.  Notes / durationMs are immutable after stopRecord, so
// trim + clips are the only axes edits change.
function matchesBaseline(s: FreeSnapshot, b: FreeSnapshot | null): boolean {
  return !!b
      && b.notes === s.notes
      && b.trimStartMs === s.trimStartMs
      && b.trimEndMs   === s.trimEndMs
      && b.clips       === s.clips
}

export function useEditor(initial: FreeSnapshot = EMPTY_SNAPSHOT): EditorApi {
  const [snapshot, setSnapshot] = useState<FreeSnapshot>(initial)
  const [clipboard, setClipboard] = useState<Clip | null>(null)

  const pastRef     = useRef<FreeSnapshot[]>([])
  const futureRef   = useRef<FreeSnapshot[]>([])
  const baselineRef = useRef<FreeSnapshot | null>(initial)
  const [, bump]    = useState(0)
  const bumpHistory = useCallback(() => bump(v => v + 1), [])

  const collapseIfBaseline = useCallback((s: FreeSnapshot) => {
    if (matchesBaseline(s, baselineRef.current)) {
      pastRef.current   = []
      futureRef.current = []
    }
  }, [])

  const apply = useCallback((fn: (s: FreeSnapshot) => FreeSnapshot) => {
    setSnapshot((prev) => {
      const next = fn(prev)
      if (next === prev) return prev
      pastRef.current.push(prev)
      futureRef.current = []
      collapseIfBaseline(next)
      bumpHistory()
      return next
    })
  }, [bumpHistory, collapseIfBaseline])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (!prev) return
    setSnapshot((cur) => {
      futureRef.current.push(cur)
      collapseIfBaseline(prev)
      bumpHistory()
      return prev
    })
  }, [bumpHistory, collapseIfBaseline])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    setSnapshot((cur) => {
      pastRef.current.push(cur)
      collapseIfBaseline(next)
      bumpHistory()
      return next
    })
  }, [bumpHistory, collapseIfBaseline])

  const reset = useCallback((snap: FreeSnapshot) => {
    const normalised = { ...snap, clips: snap.clips ?? [] }
    pastRef.current   = []
    futureRef.current = []
    baselineRef.current = normalised
    setSnapshot(normalised)
    bumpHistory()
  }, [bumpHistory])

  const setBaseline = useCallback((snap: FreeSnapshot) => {
    pastRef.current   = []
    futureRef.current = []
    baselineRef.current = snap
    setSnapshot(snap)
    bumpHistory()
  }, [bumpHistory])

  return {
    snapshot,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    clipboard,
    apply,
    undo,
    redo,
    reset,
    setBaseline,
    copyClip: (clip) => setClipboard({ ...clip }),
  }
}
