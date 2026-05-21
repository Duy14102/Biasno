import type { PracticeMode } from '../types'
import type { TranslationKey } from '../i18n/translations'

export type Skill = 'melody' | 'rhythm' | 'melody-rhythm'
export type HandFilter = 'right' | 'left' | 'both'

export function parseMode(mode: PracticeMode): { hand: HandFilter | null; skill: Skill | null } {
  if (mode === 'view-listen') return { hand: null, skill: null }
  const m = mode as string
  const dash = m.indexOf('-')
  if (dash < 0) return { hand: null, skill: null }
  return {
    hand:  m.slice(0, dash) as HandFilter,
    skill: m.slice(dash + 1) as Skill,
  }
}

export function handLabelKey(h: HandFilter): TranslationKey {
  return h === 'left' ? 'leftHand' : h === 'right' ? 'rightHand' : 'bothHands'
}

export function skillLabelKey(s: Skill): TranslationKey {
  return s === 'melody' ? 'melody' : s === 'rhythm' ? 'rhythm' : 'melodyRhythm'
}

export function modeLabel(
  mode: PracticeMode,
  t: (k: TranslationKey) => string,
  separator = ' · ',
): string {
  if (mode === 'view-listen') return t('viewListenShort')
  const { hand, skill } = parseMode(mode)
  if (!hand || !skill) return mode
  return `${t(handLabelKey(hand))}${separator}${t(skillLabelKey(skill))}`
}

export function getActiveHands(mode: PracticeMode): ('left' | 'right')[] {
  if (mode.startsWith('left')) return ['left']
  if (mode.startsWith('right')) return ['right']
  return ['left', 'right']
}

export function requiresMelody(mode: PracticeMode): boolean {
  return mode.includes('melody') || mode === 'view-listen'
}

export function requiresRhythm(mode: PracticeMode): boolean {
  return mode.includes('rhythm') || mode === 'view-listen'
}
