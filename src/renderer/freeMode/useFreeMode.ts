// Top-level Free-Mode hook.  Composes the capture-only useRecorder, the
// pure history-keeping useEditor, and the pure clipOps helpers into the
// single object the page consumes.  Nothing in the inner layers reaches
// across the boundary — useRecorder doesn't know about history, useEditor
// doesn't know about MIDI capture, and the clipOps don't know about either.

import { useCallback, useRef } from 'react'
import { useEditor, EMPTY_SNAPSHOT } from './useEditor'
import { useRecorder, type CaptureResult } from './useRecorder'
import * as ops from './clipOps'
import type { Clip, FreeSnapshot } from './types'

interface Options {
  // Fires immediately after stopRecord, with the just-emitted snapshot.
  // Used by the page to persist library entries.  hadNotes is false when
  // the take captured nothing.  continued is true when the take started
  // via continueRecord (so the existing library entry should be updated
  // in place).
  onAfterStop?:  (snap: FreeSnapshot, hadNotes: boolean, continued: boolean) => void
  // Fires when the working draft is wiped via clear().
  onAfterClear?: () => void
}

export interface FreeModeApi {
  isRecording:  boolean
  snapshot:     FreeSnapshot
  canUndo:      boolean
  canRedo:      boolean
  clipboard:    Clip | null

  startRecord:    () => void
  continueRecord: () => void
  stopRecord:     () => void
  clear:          () => void
  playInput:      (midi: number, velocity: number, on: boolean) => void

  setTrimStart: (ms: number) => void
  setTrimEnd:   (ms: number) => void

  splitClipAt:     (atMs: number) => void
  deleteClipAt:    (atMs: number) => void
  setClipVolumeAt: (atMs: number, volume: number) => void
  toggleLockAt:    (atMs: number) => void
  setClipCommentAt:(atMs: number, comment: string) => void
  copyClipAt:      (atMs: number) => void
  pasteClipAt:     (atMs: number) => void
  moveClipTo:      (clipId: string, slot: number) => void

  undo: () => void
  redo: () => void
  replaceSnapshot: (snap: FreeSnapshot) => void
}

// Build the snapshot that becomes the new baseline after stopRecord.  When
// continuing, prior trim + clips are preserved and (if new notes extended
// past the prior duration) a fresh clip is appended for the new range.
// Without that, the playback engine would filter notes outside any clip and
// the new tail would appear visible-but-silent.
function buildStopSnapshot(result: CaptureResult): FreeSnapshot {
  const { notes, durationMs, continued, baseAtStart } = result
  if (!continued || !baseAtStart) {
    return { notes, durationMs, trimStartMs: 0, trimEndMs: durationMs, clips: [] }
  }

  const extended = durationMs > baseAtStart.durationMs
  let clips = baseAtStart.clips
  if (extended && baseAtStart.clips.length > 0) {
    const newClipStart = baseAtStart.durationMs
    const newClipEnd   = durationMs
    if (newClipEnd > newClipStart) {
      clips = [...baseAtStart.clips, ops.makeClip(newClipStart, newClipEnd)]
        .sort((a, b) => a.startMs - b.startMs)
    }
  }
  return {
    notes,
    durationMs:  Math.max(baseAtStart.durationMs, durationMs),
    trimStartMs: baseAtStart.trimStartMs,
    trimEndMs:   extended
      ? Math.max(baseAtStart.trimEndMs, durationMs)
      : baseAtStart.trimEndMs,
    clips,
  }
}

export function useFreeMode(opts: Options = {}): FreeModeApi {
  const { onAfterStop, onAfterClear } = opts

  const editor = useEditor(EMPTY_SNAPSHOT)
  // Latest snapshot in a ref so the recorder's onStop / readSnapshot
  // closures don't go stale.
  const snapshotRef = useRef<FreeSnapshot>(editor.snapshot)
  snapshotRef.current = editor.snapshot

  const handleStop = useCallback((result: CaptureResult) => {
    const next = buildStopSnapshot(result)
    editor.setBaseline(next)
    onAfterStop?.(next, result.hadNotes, result.continued)
  }, [editor, onAfterStop])

  const recorder = useRecorder({
    readSnapshot: () => snapshotRef.current,
    onStop:       handleStop,
  })

  const clear = useCallback(() => {
    if (recorder.isRecording) recorder.stopRecord()
    editor.reset(EMPTY_SNAPSHOT)
    onAfterClear?.()
  }, [editor, recorder, onAfterClear])

  // ── Clip operations (wrap pure clipOps via editor.apply) ──────────────
  const splitClipAt     = useCallback((ms: number) => editor.apply(s => ops.splitAt(s, ms)),                    [editor])
  const deleteClipAt    = useCallback((ms: number) => editor.apply(s => ops.deleteAt(s, ms)),                   [editor])
  const setClipVolumeAt = useCallback((ms: number, v: number) => editor.apply(s => ops.setVolumeAt(s, ms, v)),  [editor])
  const toggleLockAt    = useCallback((ms: number) => editor.apply(s => ops.toggleLockAt(s, ms)),               [editor])
  const setClipCommentAt= useCallback((ms: number, c: string) => editor.apply(s => ops.setCommentAt(s, ms, c)), [editor])
  const moveClipTo      = useCallback((clipId: string, slot: number) => editor.apply(s => ops.moveToSlot(s, clipId, slot)), [editor])

  const setTrimStart = useCallback((ms: number) => editor.apply(s => ops.setTrimStart(s, ms)), [editor])
  const setTrimEnd   = useCallback((ms: number) => editor.apply(s => ops.setTrimEnd  (s, ms)), [editor])

  // Copy uses the live snapshot; refuses if the cursor isn't on a clip.
  const copyClipAt = useCallback((ms: number) => {
    const target = ops.clipAt(snapshotRef.current, ms)
    if (target) editor.copyClip(target)
  }, [editor])

  const pasteClipAt = useCallback((ms: number) => {
    const src = editor.clipboard
    if (!src) return
    editor.apply(s => ops.pasteAt(s, src, ms))
  }, [editor])

  return {
    isRecording: recorder.isRecording,
    snapshot:    editor.snapshot,
    canUndo:     editor.canUndo,
    canRedo:     editor.canRedo,
    clipboard:   editor.clipboard,

    startRecord:    recorder.startRecord,
    continueRecord: recorder.continueRecord,
    stopRecord:     recorder.stopRecord,
    clear,
    playInput:      recorder.playInput,

    setTrimStart, setTrimEnd,

    splitClipAt, deleteClipAt, setClipVolumeAt, toggleLockAt,
    setClipCommentAt, copyClipAt, pasteClipAt, moveClipTo,

    undo: editor.undo,
    redo: editor.redo,
    replaceSnapshot: editor.reset,
  }
}
