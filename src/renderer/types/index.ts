// Barrel re-export for the per-domain type modules.  Callers can keep
// importing `from '@renderer/types'` (or the relative equivalent) and get
// everything; new code can also import the focused sub-modules directly if
// it cares only about, say, MIDI types.
export type * from './midi'
export type * from './practice'
export type * from './visual'
export type * from './device'
