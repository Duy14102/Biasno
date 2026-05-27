import React from 'react'

// Free-Mode SVG icon set.  Same conventions as components/header/icons.tsx —
// 24×24 viewBox, fill=currentColor, default w-4/h-4 so they inherit colour
// and size from the surrounding button.

type IconProps = { className?: string }

function Svg({ className = 'w-4 h-4', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {children}
    </svg>
  )
}

// ─── Recording ──────────────────────────────────────────────────────────────
// Studio microphone — used as the primary record affordance.
export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.91-3a.5.5 0 0 0-.5.5 5.41 5.41 0 1 1-10.82 0 .5.5 0 0 0-.5-.5h-.5a.5.5 0 0 0-.5.5 6.91 6.91 0 0 0 6.41 6.88V21a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-2.62A6.91 6.91 0 0 0 18.91 11.5a.5.5 0 0 0-.5-.5h-.5z"/>
  </Svg>
)

// Solid square for "stop recording".
export const StopIcon = (p: IconProps) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="1.5"/></Svg>
)

// ─── Transport ──────────────────────────────────────────────────────────────
export const PlayIcon  = (p: IconProps) => <Svg {...p}><path d="M8 5v14l11-7L8 5z"/></Svg>
export const PauseIcon = (p: IconProps) => <Svg {...p}><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></Svg>

// Curved arrow pointing back (undo).
export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A8.93 8.93 0 0 1 12.5 11c3.54 0 6.55 2.31 7.6 5.5l2.37-.78A10.012 10.012 0 0 0 12.5 8z"/>
  </Svg>
)
export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18.4 10.6A8.99 8.99 0 0 0 11.5 8a10.012 10.012 0 0 0-9.97 7.72l2.37.78A8.005 8.005 0 0 1 11.5 11c1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
  </Svg>
)

// Scissor blades — trim affordance.
export const ScissorsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6-7.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zM19 3l-6 6 2 2 7-7V3z"/>
  </Svg>
)

// Trash bin — clear / delete.
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
  </Svg>
)

// ─── Navigation / panel ────────────────────────────────────────────────────
// Stack of horizontal lines + a "spine" — reads as a record library / songs list.
export const LibraryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3h2v18H4V3zm3 0h2v18H7V3zm4 0h7l2 18h-7l-2-18z"/>
  </Svg>
)

// X for close.
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 11.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
  </Svg>
)

// Folder-with-music — generic "loaded recording" indicator.
export const FolderMusicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2zm6 9.5V16a1.5 1.5 0 1 1-1.5-1.5c.18 0 .35.04.5.1V11h2v2.5h-1z"/>
  </Svg>
)

// ─── Export targets ────────────────────────────────────────────────────────
// Single eighth-note glyph — used for MIDI button (audio).
export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </Svg>
)

// Staff lines — used for MusicXML button (notation).
export const StaffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18v1.5H3V5zm0 4h18v1.5H3V9zm0 4h18v1.5H3V13zm0 4h18v1.5H3V17z"/>
  </Svg>
)

// Document with "PDF" — used for PDF button (printable sheet).
export const PdfIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8.5 13H7v5h1.5v-2H10c.83 0 1.5-.67 1.5-1.5S10.83 13 10 13H8.5zm0 2v-1H10v1H8.5zm5 3H12v-5h1.5c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2zm0-4H13v3h.5c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1zm5-1H17v5h1.5v-2H20v-1h-1.5v-1H20v-1h-1.5z"/>
  </Svg>
)

// Download arrow into a tray — Export action.
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20h14v-2H5v2zm7-18a1 1 0 0 0-1 1v9.59L7.7 9.29a1 1 0 0 0-1.4 1.42l5 5a1 1 0 0 0 1.4 0l5-5a1 1 0 0 0-1.4-1.42L13 12.59V3a1 1 0 0 0-1-1z"/>
  </Svg>
)

// Chevron pointing down — dropdown indicator.
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </Svg>
)

// Plus inside a circle — "Continue recording" affordance.  Reads as
// "add to" rather than "start over".
export const PlusCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
  </Svg>
)

// Speech / chat bubble with a tail at the bottom-left — used to badge a
// clip that carries a comment on the trim bar.
export const BubbleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.5l-4.5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
  </Svg>
)
