import React from 'react'

// Shared header-icon set.  All icons render at the size of their parent's
// text (1em) and inherit `currentColor`, so they match whatever button they
// sit inside without per-icon colour tweaks.  Default sizing matches the
// 36×36 IconBtn (w-4 h-4); play / pause sit in the bigger play pill (w-5 h-5).

type IconProps = { className?: string }

function Svg({ className = 'w-4 h-4', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {children}
    </svg>
  )
}

// ─── Transport ───────────────────────────────────────────────────────────────
export const BackIcon       = (p: IconProps) => <Svg {...p}><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></Svg>
export const ArrowRightIcon = (p: IconProps) => <Svg {...p}><path d="M4 13h12.17l-5.59 5.59L12 20l8-8-8-8-1.42 1.41L16.17 11H4v2z"/></Svg>
export const RewindIcon     = (p: IconProps) => <Svg {...p}><path d="M11 18V6l-8.5 6L11 18zm.5-6L20 18V6l-8.5 6z"/></Svg>
export const FastFwdIcon    = (p: IconProps) => <Svg {...p}><path d="M4 18l8.5-6L4 6v12zm9.5-12v12L22 12l-8.5-6z"/></Svg>
export const PlayIcon       = (p: IconProps) => <Svg {...p}><path d="M8 5v14l11-7L8 5z"/></Svg>
export const PauseIcon      = (p: IconProps) => <Svg {...p}><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></Svg>
export const RestartIcon    = (p: IconProps) => <Svg {...p}><path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></Svg>

// ─── BPM nudges ──────────────────────────────────────────────────────────────
export const MinusIcon = (p: IconProps) => <Svg {...p}><path d="M5 11h14v2H5z"/></Svg>
export const PlusIcon  = (p: IconProps) => <Svg {...p}><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></Svg>

// ─── Toggles ─────────────────────────────────────────────────────────────────
// Triangular metronome with a swinging arm.
export const MetronomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2h6l4 18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L9 2zm2.2 2L8.4 17h7.2L12.8 4h-1.6zM12 6.5l3.5 9-1 1.5L12 9.5l-2.5 7.5-1-1.5L12 6.5z"/>
  </Svg>
)
// Loop arrow.
export const LoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
  </Svg>
)
// Sheet music — staff lines plus a note glyph.
export const SheetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 4H3v2h18V4zm0 4H3v2h18V8zM3 12h12v2H3v-2zm0 4h12v2H3v-2zm14.5-2.5v6a2 2 0 1 1-2-2 2 2 0 0 1 .59.09v-4.09H21v2h-3.5z"/>
  </Svg>
)
// Falling-notes / piano keyboard glyph.
export const PianoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h18v16H3V4zm2 2v12h3v-5h1V6H5zm5 0v7h1v5h2v-5h1V6h-4zm6 0v7h1v5h3V6h-4z"/>
  </Svg>
)

// ─── Popover triggers ────────────────────────────────────────────────────────
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.46 7.46 0 0 0-1.63-.95l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.5 7.5 0 0 0-1.63.95l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.95l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.13-.56 1.63-.95l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>
  </Svg>
)
export const KeyboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 12H4V7h16v10zM6 9h2v2H6V9zm0 4h2v2H6v-2zm3-4h2v2H9V9zm0 4h6v2H9v-2zm4-4h2v2h-2V9zm3 0h2v2h-2V9zm0 4h2v2h-2v-2z"/>
  </Svg>
)

// ─── Mode-page identifiers ───────────────────────────────────────────────────
// Five-finger flat hand silhouette (Material `back_hand`).  Used for the
// "right hand" badge.  Left hand mirrors the same path; both-hands draws two
// scaled copies side-by-side.
const HAND_PATH = "M18 7c-.28 0-.5.22-.5.5V11h-1V3.5c0-.83-.67-1.5-1.5-1.5S13.5 2.67 13.5 3.5V11h-1V2c0-.83-.67-1.5-1.5-1.5S9.5 1.17 9.5 2v9h-1V4c0-.83-.67-1.5-1.5-1.5S5.5 3.17 5.5 4v11.5L3.18 13.25c-.61-.59-1.58-.59-2.18.01-.6.6-.6 1.58-.01 2.19l5.62 5.78C7.43 21.85 8.41 22 9.83 22h6.55c1.65 0 3.04-1.2 3.29-2.83L21 11c.07-.45-.14-.92-.59-1.08-.05-.01-.18-.04-.41-.06V8.5c0-.28-.22-.5-.5-.5z"

export const RightHandIcon = (p: IconProps) => (
  <Svg {...p}><g transform="matrix(-1 0 0 1 24 0)"><path d={HAND_PATH}/></g></Svg>
)
export const LeftHandIcon = (p: IconProps) => (
  <Svg {...p}><path d={HAND_PATH}/></Svg>
)
export const BothHandsIcon = (p: IconProps) => (
  <Svg {...p}>
    <g transform="translate(-2 4) scale(0.55)"><path d={HAND_PATH}/></g>
    <g transform="translate(26 4) scale(-0.55 0.55)"><path d={HAND_PATH}/></g>
  </Svg>
)

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
  </Svg>
)
export const MusicNoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </Svg>
)
export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2z"/>
  </Svg>
)

// ─── Settings panel rows ─────────────────────────────────────────────────────
export const VolMuteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.52 1.52A8.95 8.95 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73 12 10.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </Svg>
)
export const VolLowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9v6h4l5 5V4l-5 5H7z"/>
  </Svg>
)
export const VolMedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9v6h4l5 5V4l-5 5H7zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
  </Svg>
)
export const VolHighIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77S18.01 4.14 14 3.23z"/>
  </Svg>
)
// Magnifying glass for "note size".
export const ZoomIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/>
  </Svg>
)
// Bar-line ruler for "measure lines".
export const MeasureIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2v16H3V4zm4 0h2v10H7V4zm4 0h2v16h-2V4zm4 0h2v10h-2V4zm4 0h2v16h-2V4z"/>
  </Svg>
)
// Clock face for "3-2-1 countdown".
export const CountdownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42a8.59 8.59 0 0 0-1.42-1.41l-1.42 1.42A9 9 0 1 0 21 13a8.95 8.95 0 0 0-1.97-5.61z"/>
  </Svg>
)
// Padlock for the locked key-count state.
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm9 14H6V10h12v10zm-6-3a2 2 0 1 0-2-2 2 2 0 0 0 2 2z"/>
  </Svg>
)
