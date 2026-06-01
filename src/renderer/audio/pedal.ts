// Pure sustain-pedal helpers — the single source of "how long does this note
// actually sound once the damper pedal is taken into account".  No audio, no
// React; just timeline math so it can be unit-tested and reused by both the
// practice scheduler and Free-Mode playback / export.
//
// A PedalEvent timeline is a time-sorted list of damper edges.  Between a
// `down: true` edge and the next `down: false` edge the pedal is held, so any
// note whose key is released in that span keeps ringing until the pedal lifts.

import type { PedalEvent } from '@/types'

// Is the pedal held at time `t`?  The pedal is down from a `down:true` edge up
// to (not including) the next `down:false` edge.  Defaults to up before the
// first event.
export function pedalDownAt(t: number, events: readonly PedalEvent[]): boolean {
  let down = false
  for (const e of events) {
    if (e.time > t) break
    down = e.down
  }
  return down
}

// The time the next pedal-up happens at or after `from`, or null if the pedal
// never lifts again in the timeline.
function nextPedalUp(from: number, events: readonly PedalEvent[]): number | null {
  for (const e of events) {
    if (!e.down && e.time >= from) return e.time
  }
  return null
}

// Audible end of a note: if the pedal is held when the key is released
// (`noteEnd`), the note rings until the next pedal-up (capped at `songEnd`);
// otherwise it ends at `noteEnd`.  Never returns less than `noteEnd`.
export function sustainedEnd(
  noteEnd: number,
  events: readonly PedalEvent[] | undefined,
  songEnd: number,
): number {
  if (!events || events.length === 0) return noteEnd
  if (!pedalDownAt(noteEnd, events)) return noteEnd
  const up = nextPedalUp(noteEnd, events)
  const end = up === null ? songEnd : up
  return Math.max(noteEnd, Math.min(end, songEnd))
}
