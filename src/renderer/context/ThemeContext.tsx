import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LS } from '../constants/storageKeys'

export type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme:  Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readInitial(): Theme {
  try {
    const stored = localStorage.getItem(LS.THEME)
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* ignore */ }
  return 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(LS.THEME, theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle   = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
