import React, { useEffect, useRef, useState } from 'react'
import { useTheme }    from '@/context'
import { useLanguage } from '@/i18n'
import { LANGUAGES, type Lang } from '@/i18n'

// ─── Animation styles ────────────────────────────────────────────────────────
// `settingsDdEnter` — panel fade + slide on open.
// `settingsOptionIn` — staggered row fade-in for language entries.
// `gearSpin` — one-off rotate when the gear button is pressed.
// `thumbBounce` — quick squash on the theme toggle thumb when flipped.
// `themeFacePop` — sun/moon icon swap.
const SETTINGS_STYLE = `
@keyframes settingsDdEnter {
  0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes settingsOptionIn {
  0%   { opacity: 0; transform: translateX(-6px); }
  100% { opacity: 1; transform: translateX(0);    }
}
@keyframes gearSpin {
  0%   { transform: rotate(0);    }
  100% { transform: rotate(120deg); }
}
@keyframes thumbBounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(0.78); }
  100% { transform: scale(1); }
}
@keyframes themeFacePop {
  0%   { transform: scale(0.4) rotate(-40deg); opacity: 0; }
  100% { transform: scale(1)   rotate(0);      opacity: 1; }
}
.settings-dd-enter  { animation: settingsDdEnter 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.settings-opt-enter { animation: settingsOptionIn 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.gear-spin          { animation: gearSpin 480ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.thumb-bounce       { animation: thumbBounce 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.theme-face-pop     { animation: themeFacePop 320ms cubic-bezier(0.16, 1, 0.3, 1); }
`

/** Combined settings popover for the home header — collapses the previously
 *  two separate theme + language buttons into a single gear trigger. */
export default function HomeSettings(): React.JSX.Element {
  const { theme, toggle }         = useTheme()
  const { lang, setLang, t }      = useLanguage()
  const [open, setOpen]           = useState(false)
  const [spinKey, setSpinKey]     = useState(0)
  const [themeAnimKey, setThemeAnimKey] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const isDark = theme === 'dark'
  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const handleTrigger = () => {
    setOpen((v) => !v)
    setSpinKey((k) => k + 1)
  }

  const handleThemeToggle = () => {
    toggle()
    setThemeAnimKey((k) => k + 1)
  }

  const pickLang = (code: Lang) => {
    if (code !== lang) setLang(code)
  }

  return (
    <div ref={ref} className="relative">
      <style>{SETTINGS_STYLE}</style>

      {/* Trigger — gear icon with a quick rotation on click. */}
      <button
        type="button"
        onClick={handleTrigger}
        title={t('settings')}
        aria-label={t('settings')}
        aria-expanded={open}
        className={[
          'relative flex items-center justify-center w-9 h-9 rounded-lg',
          'border transition-[background-color,border-color,box-shadow,transform] duration-150',
          open
            ? 'bg-slate-200 border-slate-400 text-slate-900 shadow-lg shadow-blue-500/20 dark:bg-slate-700 dark:border-slate-500 dark:text-white'
            : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-white hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/15 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:border-blue-400/50',
        ].join(' ')}
      >
        <span key={spinKey} className={spinKey > 0 ? 'gear-spin inline-flex' : 'inline-flex'}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.46 7.46 0 0 0-1.63-.95l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.5 7.5 0 0 0-1.63.95l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.95l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.13-.56 1.63-.95l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="settings-dd-enter absolute right-0 top-full mt-2 z-50 w-[16rem] rounded-xl bg-white/95 border-slate-200 dark:bg-slate-800/95 dark:border-slate-600/80 backdrop-blur-md border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden origin-top-right">

          {/* ── Theme section ───────────────────────────────────────────── */}
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-2">
              {t('theme')}
            </p>
            <button
              type="button"
              onClick={handleThemeToggle}
              title={isDark ? t('themeDarkHint') : t('themeLightHint')}
              className={[
                'relative w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg',
                'border transition-[background-color,border-color] duration-150',
                'bg-slate-50 border-slate-200 hover:bg-white hover:border-blue-400',
                'dark:bg-slate-900/60 dark:border-slate-700 dark:hover:bg-slate-900 dark:hover:border-blue-400/60',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                <span key={themeAnimKey} className={`leading-none ${themeAnimKey > 0 ? 'theme-face-pop inline-flex' : 'inline-flex'}`}>
                  {isDark ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-500 dark:text-blue-300">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-500">
                      <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 17a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zm10-8a1 1 0 0 1-1 1h-2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zM5 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zm13.66-6.66a1 1 0 0 1 0 1.41l-1.41 1.42a1 1 0 1 1-1.42-1.42l1.42-1.41a1 1 0 0 1 1.41 0zM7.17 16.83a1 1 0 0 1 0 1.41l-1.42 1.42a1 1 0 1 1-1.41-1.42l1.41-1.41a1 1 0 0 1 1.42 0zm11.49 1.41a1 1 0 0 1-1.41 1.42l-1.42-1.42a1 1 0 1 1 1.42-1.41l1.41 1.41zM7.17 7.17A1 1 0 0 1 5.76 8.59L4.34 7.17a1 1 0 0 1 1.41-1.41l1.42 1.41z" />
                    </svg>
                  )}
                </span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {isDark ? t('themeDark') : t('themeLight')}
                </span>
              </span>

              {/* Sliding pill switch */}
              <span
                className={[
                  'relative w-10 h-5 rounded-full transition-colors duration-200',
                  isDark ? 'bg-blue-500/80' : 'bg-slate-300',
                ].join(' ')}
              >
                <span
                  key={`thumb-${themeAnimKey}`}
                  className={[
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow',
                    'transition-[left] duration-250 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    isDark ? 'left-[1.375rem]' : 'left-0.5',
                    themeAnimKey > 0 ? 'thumb-bounce' : '',
                  ].join(' ')}
                />
              </span>
            </button>
          </div>

          {/* divider */}
          <div className="h-px mx-3 bg-slate-200 dark:bg-slate-700/60" />

          {/* ── Language section ────────────────────────────────────────── */}
          <div className="px-3 pt-2 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1.5">
              {t('language')}
            </p>
            <div className="flex flex-col gap-1">
              {LANGUAGES.map((l, i) => {
                const isActive = l.code === active.code
                return (
                  <button
                    key={l.code}
                    onClick={() => pickLang(l.code)}
                    style={{ animationDelay: `${80 + i * 50}ms` }}
                    className={[
                      'settings-opt-enter w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-left',
                      'transition-[background-color,color,padding-left] duration-150',
                      isActive
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100 font-semibold'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white hover:pl-3.5',
                    ].join(' ')}
                  >
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="flex-1">{l.label}</span>
                    {isActive && (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-blue-500 dark:text-blue-300">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
