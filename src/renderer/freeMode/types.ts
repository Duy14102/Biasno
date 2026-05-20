// Free Mode — recording data shape.
// Times are stored in milliseconds relative to the moment recording started
// (the first key-down resets t=0).  endMs = startMs until the key is released.

export interface RecordedNote {
  id:        string
  midi:      number
  startMs:   number
  endMs:     number
  velocity:  number
}

// A snapshot pushed onto the undo stack.  Notes are shared by reference;
// trim fields are the only thing edits mutate, so the rest is cheap to clone.
export interface FreeSnapshot {
  notes:        RecordedNote[]
  durationMs:   number
  trimStartMs:  number
  trimEndMs:    number
}
