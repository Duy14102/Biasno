// Free Mode — recording data shape.
// Times are stored in milliseconds relative to the moment recording started
// (the first key-down resets t=0).  endMs = startMs until the key is released.

export interface RecordedNote {
  id:        string
  midi:      number
  startMs:   number
  endMs:     number
  velocity:  number
  // True when the note was re-anchored by `deleteAt` — its audio originally
  // started earlier (in a now-deleted clip) so the envelope should pick up
  // at sustain level instead of attacking from 0.  Set ONLY by deleteAt,
  // never by splitAt: splitting must not touch notes, so this flag is
  // exclusively a delete-time concern.
  continues?: boolean
}

// A "clip" is a sub-region inside [trimStartMs, trimEndMs] that the user can
// manipulate independently — split, delete, volume, lock, comment.  Empty
// clips[] means "no subdivisions, behave as one clip across the whole trim
// window" (the original single-trim behaviour).  Once the user performs any
// clip operation we materialise the implicit clip into an explicit one.
export interface Clip {
  id:       string
  startMs:  number
  endMs:    number
  volume:   number    // playback / export velocity multiplier (0–2, default 1)
  locked:   boolean
  comment?: string
}

// A snapshot pushed onto the undo stack.  Notes are shared by reference;
// trim + clip fields are the only things edits mutate, so the rest is cheap
// to clone.
export interface FreeSnapshot {
  notes:        RecordedNote[]
  durationMs:   number
  trimStartMs:  number
  trimEndMs:    number
  clips:        Clip[]
}
