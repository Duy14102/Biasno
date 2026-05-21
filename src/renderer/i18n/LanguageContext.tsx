import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DICTIONARIES, type Lang, type TranslationKey } from './translations'
import { LS } from '../constants/storageKeys'

interface LanguageContextValue {
  lang:    Lang
  setLang: (lang: Lang) => void
  t:       (key: TranslationKey, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readInitial(): Lang {
  try {
    const stored = localStorage.getItem(LS.LANG)
    if (stored === 'vi' || stored === 'en') return stored
  } catch { /* localStorage may be unavailable */ }
  return 'vi'
}

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lang, setLangState] = useState<Lang>(readInitial)

  useEffect(() => {
    try { localStorage.setItem(LS.LANG, lang) } catch { /* ignore */ }
  }, [lang])

  const setLang = useCallback((next: Lang) => setLangState(next), [])

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>) => {
    const dict = DICTIONARIES[lang]
    let str = dict[key] ?? DICTIONARIES.vi[key] ?? String(key)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return str
  }, [lang])

  const value = useMemo<LanguageContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
