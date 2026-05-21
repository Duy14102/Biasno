import type { PracticeMode } from '@/types'
import type { TranslationKey } from './translations'

/** Map each PracticeMode to the translation key used in the mode-change
 *  flash overlay.  Kept separate so `constants.ts` doesn't need to know
 *  about translations and the flat-key dictionary stays grep-friendly. */
export const MODE_FLASH_KEYS: Record<PracticeMode, TranslationKey> = {
  'view-listen':         'modeFlashViewListen',
  'left-melody':         'modeFlashLeftMelody',
  'right-melody':        'modeFlashRightMelody',
  'both-melody':         'modeFlashBothMelody',
  'left-rhythm':         'modeFlashLeftRhythm',
  'right-rhythm':        'modeFlashRightRhythm',
  'both-rhythm':         'modeFlashBothRhythm',
  'left-melody-rhythm':  'modeFlashLeftMR',
  'right-melody-rhythm': 'modeFlashRightMR',
  'both-melody-rhythm':  'modeFlashBothMR',
}
