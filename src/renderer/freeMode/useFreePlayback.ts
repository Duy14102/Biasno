// Plays back a recorded FreeSnapshot via AudioEngine.
//
// Only the [trimStartMs, trimEndMs] slice is heard; that's the same slice
// used for export, so what the user hears is exactly what they'll save.
// The "playhead" is reported in ms (song time) so the FreeModePage can
// light up keys + paint a moving cursor across the waveform.
//
// Two interactive affordances live here:
//   • seek(ms): jump the playhead to a specific position.  Used by the trim
//     waveform's click-to-mark — the click sets both the snap marker AND
//     the play-from position, just like dragging the cursor in a video
//     editor's timeline.
//   • play() starts from the current headMs (clamped into the trim region),
//     so clicking somewhere and then hitting Play resumes from that point.

import { useCallback, useEffect, useRef, useState } from 'react'
import { audioEngine } from '@/audio'
import type { Clip, FreeSnapshot } from './types'
import { chunkEndAt, effectiveClips } from './clipOps'

interface Args {
  snapshot: FreeSnapshot
  // Playback speed multiplier.  1 = real time, 0.5 = half, 2 = double.
  speed?:   number
  // Fires every animation frame while playing.  Set of currently-sounding
  // MIDI numbers — used by FreeModePage to drive PianoKeyboard.activeKeys.
  onActive?: (active: Set<number>) => void
}

// How close to the trim end counts as "at the end" — pressing Play when
// the head is here rewinds it to trim start first, so a single click
// re-plays the take instead of starting at the dead end.
const END_EPS_MS = 60

export function useFreePlayback({ snapshot, speed = 1, onActive }: Args) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [headMs,    setHeadMs]    = useState(0)

  const playStartAcRef = useRef(0)   // AudioContext time when play() was called
  const headOffsetRef  = useRef(0)   // song-ms offset applied at play() start
  const speedRef       = useRef(1)
  const rafRef         = useRef<number | null>(null)
  const isPlayingRef   = useRef(false)
  const headMsRef      = useRef(0)
  useEffect(() => { headMsRef.current = headMs }, [headMs])
  useEffect(() => { speedRef.current  = speed  }, [speed])

  const stop = useCallback(() => {
    if (!isPlayingRef.current) return
    isPlayingRef.current = false
    setIsPlaying(false)
    audioEngine.stopAll()
    audioEngine.restoreVolume()
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    onActive?.(new Set())
  }, [onActive])

  // Drop the playhead at a specific point (clamped to trim region).
  // Stops any in-flight playback so the next play() picks up from `ms`.
  const seek = useCallback((ms: number) => {
    const clamped = Math.max(snapshot.trimStartMs, Math.min(snapshot.trimEndMs, ms))
    if (isPlayingRef.current) stop()
    setHeadMs(clamped)
  }, [snapshot.trimStartMs, snapshot.trimEndMs, stop])

  const play = useCallback(() => {
    if (isPlayingRef.current) return
    const region = { start: snapshot.trimStartMs, end: snapshot.trimEndMs }

    // Where to start.  Use the parked playhead unless it's at/past the end
    // of the trim — in that case rewind to trim start so Play feels alive.
    const headNow = headMsRef.current
    let fromMs = (headNow >= region.start && headNow < region.end - END_EPS_MS)
      ? headNow
      : region.start

    // Clips define the playable sub-regions inside [trim].  A note plays
    // only if its onset falls inside SOME clip past fromMs; the clip's
    // volume scales the note velocity.  Empty clips[] → effectiveClips
    // returns the implicit "whole trim" clip so this is a no-op in the
    // default state.
    const clips = effectiveClips(snapshot)
    // Reverse iteration so a note onset on a split-touching boundary
    // belongs to the RIGHT clip (where it has audible duration) rather
    // than the LEFT (where its audible window would clamp to 0 ms).
    const containingClip = (startMs: number): Clip | null => {
      for (let i = clips.length - 1; i >= 0; i--) {
        const c = clips[i]
        if (startMs >= c.startMs && startMs <= c.endMs) return c
      }
      return null
    }
    // Include notes that overlap [from, region.end), not just those that
    // START past `from`.  A note whose onset is before the playhead but
    // whose audible tail extends past it is still sounding — the user
    // expects it to keep playing when they hit Play in the middle of it.
    const filterScheduled = (from: number) => snapshot.notes
      .filter(n => n.startMs < region.end && (n.startMs >= from || n.endMs > from))
      .map(n => ({ note: n, clip: containingClip(n.startMs) }))
      .filter((p): p is { note: typeof snapshot.notes[number]; clip: Clip } => p.clip !== null)

    let scheduled = filterScheduled(fromMs)
    // Playhead parked in a silent stretch (gap between clips, or past the
    // last note) — auto-rewind to trim start so Play still does something.
    if (scheduled.length === 0 && fromMs !== region.start) {
      fromMs = region.start
      scheduled = filterScheduled(fromMs)
      setHeadMs(fromMs)
    }
    if (scheduled.length === 0) return

    // Merge adjacent same-pitch notes into one audio event.  Two independent
    // pastes of the same pitch can end up touching at a clip boundary (e.g.
    // user copies clip X and clip Y, drags them adjacent — X's last note and
    // Y's first note are both the same pitch and meet at the seam).  Without
    // this merge, the engine releases the first note's tail and re-attacks
    // the second, producing an audible "click" / re-articulation where A|B|C
    // (a split recording) plays one continuous tone via chunkEndAt.
    //
    // Only merge when the two clips share the same volume — otherwise the
    // user's per-clip volume change would be lost (the merged event plays at
    // the first clip's volume across the whole chain).  Volume divergence
    // means the user wants distinct dynamics, so a small re-attack click is
    // the right trade-off.
    const TOUCH_TOLERANCE_MS = 5
    const merged: typeof scheduled = []
    for (const item of scheduled) {
      const last = merged[merged.length - 1]
      if (last && last.note.midi === item.note.midi
          && item.note.startMs - last.note.endMs <= TOUCH_TOLERANCE_MS
          && last.clip.volume === item.clip.volume) {
        last.note = { ...last.note, endMs: Math.max(last.note.endMs, item.note.endMs) }
      } else {
        merged.push({ note: item.note, clip: item.clip })
      }
    }
    scheduled = merged

    // Defensive: another page (e.g. PracticePage) may have left the master
    // gain at 0 via stopAll().  Restore before scheduling so the very first
    // Play after navigation actually produces sound — the bug the user hit
    // when going Practice → Home → Free Mode → Play.
    audioEngine.restoreVolume()

    const sp = Math.max(0.1, speedRef.current)
    const ac = audioEngine.currentTime
    playStartAcRef.current = ac
    headOffsetRef.current  = fromMs

    for (const { note: n, clip: c } of scheduled) {
      // Audible end extends through every touching clip past the onset
      // clip — matches peaks.ts so split (touching) preserves audio.
      const chunkEnd  = chunkEndAt(clips, n.startMs) ?? c.endMs
      const noteEnd   = Math.min(n.endMs, chunkEnd, region.end)
      // Notes whose onset is before the playhead start playing from `fromMs`
      // (we accept the lost attack envelope — better mid-sustain than silent).
      const playStart = Math.max(n.startMs, fromMs)
      if (noteEnd <= playStart) continue
      const offsetSec = (playStart - fromMs) / 1000 / sp
      const dur       = Math.max(0.05, (noteEnd - playStart) / 1000 / sp)
      const vel       = Math.max(0, Math.min(1, n.velocity * c.volume))
      // Use the engine's default release tail (1.5 s) so a note's piano
      // sample rings out naturally past its written end — identical to
      // PracticePage playback. Without it the sample snaps off abruptly and
      // Free Mode sounds noticeably different from Practice.
      audioEngine.noteAtTime(n.midi, ac + offsetSec, dur, vel)
    }

    isPlayingRef.current = true
    setIsPlaying(true)

    const tick = () => {
      if (!isPlayingRef.current) return
      const realElapsedMs = (audioEngine.currentTime - playStartAcRef.current) * 1000
      const ms = headOffsetRef.current + realElapsedMs * sp
      setHeadMs(ms)

      if (onActive) {
        const live = new Set<number>()
        for (const { note: n } of scheduled) {
          if (n.startMs <= ms && n.endMs > ms) live.add(n.midi)
        }
        onActive(live)
      }

      if (ms >= region.end) {
        stop()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [snapshot, onActive, stop])

  // Snapshot mutation (load / clear / record) realigns the playhead to the
  // new trim start and cancels any current playback — the queued audio is
  // misaligned with the fresh notes.
  useEffect(() => {
    if (isPlayingRef.current) stop()
    setHeadMs(snapshot.trimStartMs)
  }, [snapshot, stop])

  // Changing speed mid-play would require canceling + re-scheduling every
  // outstanding note.  Simpler: stop, let the user press Play again at the
  // new tempo.
  useEffect(() => {
    if (isPlayingRef.current) stop()
    // intentionally no other deps — speed change alone is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed])

  useEffect(() => () => stop(), [stop])

  return { isPlaying, headMs, play, stop, seek }
}
