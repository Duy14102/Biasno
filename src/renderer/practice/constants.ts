// ─── Timing / layout ─────────────────────────────────────────────────────────
export const TIMING_WINDOW_MS  = 220
export const KEYBOARD_HEIGHT   = 200
export const REWIND_AMOUNT     = 5

// 300 ms is enough headroom for normal JS jitter; OSMD's render block is no
// longer a concern here because the sheet is pre-rendered on the home page.
export const LOOKAHEAD_REAL_MS = 300

// Must match FallingNotes' PX_PER_SECOND / visible window.
export const NOTE_LOOK_AHEAD_S = 4.5

// Trigger the seamless loop the instant currentTime crosses the song end.
// Any positive offset here would mean the new cycle starts at `offset` seconds
// past time 0 — and any note whose start falls inside that offset window
// would be marked "missed" by the scheduler (delaySong < -0.15) and never
// played, so the song would loop with its first few notes silent.
export const LOOP_RESET_AFTER  = 0

// How far AHEAD of a note's onset we light up its piano key in view-listen
// mode.  Two delays stack between "we decided to flash" and "user sees peak":
//   • ~16 ms — React commit + composite + 1 RAF tick before FallingNotes
//               redraws with the new time.
//   • ~36 ms — the flash keyframe peaks at 20 % of its 180 ms duration.
// So flipping the key active 52 ms BEFORE note.time puts the brightest
// frame right at the moment the falling bar touches the keyboard.
//
// Only applies in view-listen mode; practice-mode key flashes are driven by
// real user input where we can't see the future.
export const FLASH_ANTICIPATE_S = 0.052

// "Ready" pause we ADD before the first note of the song / loop iteration
// when the MIDI doesn't already have at least this much silence at the top.
// MIDIs exported from notation software typically start at time 0 with no
// pickup, which means the first downbeat lands the instant playback begins
// — too sudden for a learner.  We compute leadIn = max(0, LEAD_IN_TARGET -
// firstNoteTime) per song, so a piece that already has, say, a 3 s intro
// gets no extra padding; one that opens dry gets ~1.25 s of breathing room.
export const LEAD_IN_TARGET    = 1.25

// Mode-change flash labels now live in `i18n/modeFlashKey.ts` (translation
// keys per PracticeMode) so they switch with the active language.

// View-swap animation between SheetMusic ↔ FallingNotes, plus the brief
// mode-name flash that pops in the centre on mode change.
//
// Two stages, layered on top of each other:
//   • SHELL  — the outer container slides + fades (the "page" arriving)
//   • INNER  — the content (notes / staff) fades in slightly AFTER the
//              shell has settled, giving a "stage curtain → reveal" feel
//              rather than a flat fade.
//
// Leave: content fades out first (~120 ms), then shell slides out to the left.
// Enter: shell slides in from the right, then content fades in once it has
//        settled (delay matches shell's fade-in mid-point).
//
// No `transform: scale(...)` on the shell — scale changes the visual size
// reported by getBoundingClientRect, which can lock the FallingNotes canvas
// at sub-full-size if the canvas was first sized mid-animation.  Pure
// translate avoids that class of bug.
//
// No `filter: blur(...)` on the content — blur forces a fresh rasterisation
// of the whole area every frame; on slower GPUs this caused occasional
// toggle stutters.  Opacity + translate are composited cheaply.
export const PRACTICE_TRANSITION_STYLE = `
@keyframes modeFlash {
  0%   { opacity: 0; transform: translateY(8px) scale(0.92); }
  20%  { opacity: 1; transform: translateY(0)   scale(1);    }
  75%  { opacity: 1; transform: translateY(0)   scale(1);    }
  100% { opacity: 0; transform: translateY(-4px) scale(0.96); }
}
@keyframes shellLeave {
  0%   { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(-7%); }
}
@keyframes shellEnter {
  0%   { opacity: 0; transform: translateX(7%); }
  100% { opacity: 1; transform: translateX(0); }
}
@keyframes contentLeave {
  0%   { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-4px); }
}
@keyframes contentEnter {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
.shell-leaving    { animation: shellLeave   220ms cubic-bezier(0.4, 0, 1, 1)        both; }
.shell-entering   { animation: shellEnter   260ms cubic-bezier(0.16, 1, 0.3, 1)     both; }
.content-leaving  { animation: contentLeave 140ms 0ms   cubic-bezier(0.4, 0, 1, 1)  both; }
.content-entering { animation: contentEnter 320ms 140ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`
