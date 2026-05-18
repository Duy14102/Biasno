// Translation registry.  One file per language under ./locales — register a
// new language here and that's it.

import { vi, type Translations } from './locales/vi'
import { en } from './locales/en'

export type Lang = 'vi' | 'en'

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English',    flag: '🇬🇧' },
]

export type TranslationKey = keyof Translations

export const DICTIONARIES: Record<Lang, Translations> = { vi, en }
