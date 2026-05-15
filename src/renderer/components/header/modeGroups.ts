// ─── Practice-mode taxonomy ──────────────────────────────────────────────────
// Single source of truth for how the 10 PracticeModes are grouped (view /
// right / left / both) and what colour each group wears.  Used by the mode
// badge + dropdown in the header.

import type { PracticeMode } from '../../types'

export interface ModeItem  { id: PracticeMode; sub: string }
export interface ModeGroup { key: string; label: string | null; items: ModeItem[] }

export const MODE_GROUPS: ModeGroup[] = [
  {
    key: 'view', label: null,
    items: [{ id: 'view-listen', sub: 'Xem & Nghe' }],
  },
  {
    key: 'right', label: 'Tay phải',
    items: [
      { id: 'right-melody',        sub: 'Melody' },
      { id: 'right-rhythm',        sub: 'Rhythm' },
      { id: 'right-melody-rhythm', sub: 'Melody + Rhythm' },
    ],
  },
  {
    key: 'left', label: 'Tay trái',
    items: [
      { id: 'left-melody',        sub: 'Melody' },
      { id: 'left-rhythm',        sub: 'Rhythm' },
      { id: 'left-melody-rhythm', sub: 'Melody + Rhythm' },
    ],
  },
  {
    key: 'both', label: 'Hai tay',
    items: [
      { id: 'both-melody',        sub: 'Melody' },
      { id: 'both-rhythm',        sub: 'Rhythm' },
      { id: 'both-melody-rhythm', sub: 'Melody + Rhythm' },
    ],
  },
]

// Tailwind class strings must be statically present somewhere in the source
// for the JIT compiler to include them in the bundle — that's why these are
// kept as full literals rather than constructed from a colour token.
export const GROUP_COLORS: Record<string, { badge: string; header: string; item: string; dot: string }> = {
  view:  {
    badge:  'bg-violet-600/30 text-violet-200 border-violet-500/40 hover:bg-violet-600/50',
    header: 'text-violet-400',
    item:   'hover:bg-violet-900/30 text-violet-100',
    dot:    'bg-violet-400',
  },
  right: {
    badge:  'bg-blue-600/30 text-blue-200 border-blue-500/40 hover:bg-blue-600/50',
    header: 'text-blue-400',
    item:   'hover:bg-blue-900/30 text-blue-100',
    dot:    'bg-blue-400',
  },
  left: {
    badge:  'bg-orange-600/30 text-orange-200 border-orange-500/40 hover:bg-orange-600/50',
    header: 'text-orange-400',
    item:   'hover:bg-orange-900/30 text-orange-100',
    dot:    'bg-orange-400',
  },
  both: {
    badge:  'bg-green-600/30 text-green-200 border-green-500/40 hover:bg-green-600/50',
    header: 'text-green-400',
    item:   'hover:bg-green-900/30 text-green-100',
    dot:    'bg-green-400',
  },
}

export function modeGroup(mode: PracticeMode): string {
  if (mode === 'view-listen')    return 'view'
  if (mode.startsWith('right-')) return 'right'
  if (mode.startsWith('left-'))  return 'left'
  return 'both'
}

export function modeFullLabel(mode: PracticeMode): string {
  for (const g of MODE_GROUPS) {
    for (const item of g.items) {
      if (item.id === mode) return g.label ? `${g.label} · ${item.sub}` : item.sub
    }
  }
  return mode
}

// ─── Shared dropdown enter animation ─────────────────────────────────────────
// Tiny opacity + translateY fade-in.  No scale or filter — both would force
// the browser to re-rasterise the text inside the dropdown panel.
export const DROPDOWN_CSS = `
@keyframes hdrDdEnter {
  0%   { opacity: 0; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
.hdr-dd-enter { animation: hdrDdEnter 140ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`
