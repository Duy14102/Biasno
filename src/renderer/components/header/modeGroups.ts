// ─── Practice-mode taxonomy ──────────────────────────────────────────────────
// Single source of truth for how the 10 PracticeModes are grouped (view /
// right / left / both) and what colour each group wears.  Used by the mode
// badge + dropdown in the header.

import type { PracticeMode } from '@/types'
import type { TranslationKey } from '@/i18n'

export interface ModeItem  { id: PracticeMode; subKey: TranslationKey }
export interface ModeGroup { key: string; labelKey: TranslationKey | null; items: ModeItem[] }

export const MODE_GROUPS: ModeGroup[] = [
  {
    key: 'view', labelKey: null,
    items: [{ id: 'view-listen', subKey: 'viewListenShort' }],
  },
  {
    key: 'right', labelKey: 'rightHand',
    items: [
      { id: 'right-melody',        subKey: 'melody' },
      { id: 'right-rhythm',        subKey: 'rhythm' },
      { id: 'right-melody-rhythm', subKey: 'melodyRhythm' },
    ],
  },
  {
    key: 'left', labelKey: 'leftHand',
    items: [
      { id: 'left-melody',        subKey: 'melody' },
      { id: 'left-rhythm',        subKey: 'rhythm' },
      { id: 'left-melody-rhythm', subKey: 'melodyRhythm' },
    ],
  },
  {
    key: 'both', labelKey: 'twoHands',
    items: [
      { id: 'both-melody',        subKey: 'melody' },
      { id: 'both-rhythm',        subKey: 'rhythm' },
      { id: 'both-melody-rhythm', subKey: 'melodyRhythm' },
    ],
  },
]

// Tailwind class strings must be statically present somewhere in the source
// for the JIT compiler to include them in the bundle — that's why these are
// kept as full literals rather than constructed from a colour token.
export const GROUP_COLORS: Record<string, { badge: string; header: string; item: string; dot: string }> = {
  view:  {
    badge:  'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200 dark:bg-violet-600/30 dark:text-violet-200 dark:border-violet-500/40 dark:hover:bg-violet-600/50',
    header: 'text-violet-600 dark:text-violet-400',
    item:   'hover:bg-violet-100 text-violet-800 dark:hover:bg-violet-900/30 dark:text-violet-100',
    dot:    'bg-violet-500 dark:bg-violet-400',
  },
  right: {
    badge:  'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200 dark:bg-blue-600/30 dark:text-blue-200 dark:border-blue-500/40 dark:hover:bg-blue-600/50',
    header: 'text-blue-600 dark:text-blue-400',
    item:   'hover:bg-blue-100 text-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-100',
    dot:    'bg-blue-500 dark:bg-blue-400',
  },
  left: {
    badge:  'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200 dark:bg-orange-600/30 dark:text-orange-200 dark:border-orange-500/40 dark:hover:bg-orange-600/50',
    header: 'text-orange-600 dark:text-orange-400',
    item:   'hover:bg-orange-100 text-orange-800 dark:hover:bg-orange-900/30 dark:text-orange-100',
    dot:    'bg-orange-500 dark:bg-orange-400',
  },
  both: {
    badge:  'bg-green-100 text-green-800 border-green-300 hover:bg-green-200 dark:bg-green-600/30 dark:text-green-200 dark:border-green-500/40 dark:hover:bg-green-600/50',
    header: 'text-green-600 dark:text-green-400',
    item:   'hover:bg-green-100 text-green-800 dark:hover:bg-green-900/30 dark:text-green-100',
    dot:    'bg-green-500 dark:bg-green-400',
  },
}

export function modeGroup(mode: PracticeMode): string {
  if (mode === 'view-listen')    return 'view'
  if (mode.startsWith('right-')) return 'right'
  if (mode.startsWith('left-'))  return 'left'
  return 'both'
}

export function modeFullLabel(mode: PracticeMode, t: (k: TranslationKey) => string): string {
  for (const g of MODE_GROUPS) {
    for (const item of g.items) {
      if (item.id === mode) {
        const sub = t(item.subKey)
        return g.labelKey ? `${t(g.labelKey)} · ${sub}` : sub
      }
    }
  }
  return mode
}

// ─── Shared dropdown enter animation ─────────────────────────────────────────
// Panel: opacity + translateY fade-in only.  No scale or filter on the panel
// itself — both would force the browser to re-rasterise the text inside.
// Items inside the panel get a separate stagger so the dropdown reads as
// animating without blurring its own content.
export const DROPDOWN_CSS = `
@keyframes hdrDdEnter {
  0%   { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes hdrDdItem {
  0%   { opacity: 0; transform: translateX(-6px); }
  100% { opacity: 1; transform: translateX(0); }
}
@keyframes hdrCaretDrop {
  0%   { opacity: 0; transform: translateY(-3px); }
  100% { opacity: 1; transform: translateY(0); }
}
.hdr-dd-enter { animation: hdrDdEnter 180ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.hdr-dd-item  { animation: hdrDdItem 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.hdr-caret    { animation: hdrCaretDrop 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`
