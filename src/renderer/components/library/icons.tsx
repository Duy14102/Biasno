import React from 'react'

type IconProps = { className?: string }

/** Five vertical bars bouncing like an audio meter.  Used as the leading
 *  glyph on a file row when the user hovers it — gives a "playable" affordance. */
export function MusicBars(): React.JSX.Element {
  const delays = [0, 0.18, 0.08, 0.28, 0.14]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14, flexShrink: 0 }}>
      {delays.map((d, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: 14,
            background: '#4488ff',
            borderRadius: 1,
            transformOrigin: 'bottom',
            animation: `mbar ${0.55 + i * 0.07}s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/** Folder shape — used as the source icon on a file row whose entry came
 *  from a folder scan. */
export function FolderIcon({ className = 'w-4 h-4' }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  )
}

/** Down-arrow into a tray — reads as "imported from elsewhere".  Used as the
 *  source icon on a file row whose entry was imported one-off (dialog or
 *  drag-drop). */
export function ImportIcon({ className = 'w-4 h-4' }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  )
}

/** Trash bin — used as the hover-revealed delete affordance on each row. */
export function TrashIcon({ className = 'w-3.5 h-3.5' }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  )
}

/** Triangle with exclamation — warning glyph for unsupported / conflict states. */
export function WarningIcon({ className = 'w-4 h-4' }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  )
}

/** Magnifying-glass — leading icon on the library search input. */
export function SearchIcon({ className = 'w-4 h-4' }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

/** X glyph — close / dismiss / forget affordance. */
export function CloseIcon({ className = 'w-3.5 h-3.5' }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  )
}
