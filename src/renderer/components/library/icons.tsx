import React from 'react'

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
export function FolderIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  )
}

/** Down-arrow into a tray — reads as "imported from elsewhere".  Used as the
 *  source icon on a file row whose entry was imported one-off (dialog or
 *  drag-drop). */
export function ImportIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  )
}

/** Trash bin — used as the hover-revealed delete affordance on each row. */
export function TrashIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  )
}
