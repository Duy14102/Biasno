import React, { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { LANGUAGES, type Lang } from '../i18n/translations'

// Local animation styles — a small fade/slide for the panel, a flag wiggle
// on language change, and a subtle ring pulse on the trigger button.
const LANG_STYLE = `
@keyframes langDdEnter {
  0%   { opacity: 0; transform: translateY(-6px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes langOptionIn {
  0%   { opacity: 0; transform: translateX(-4px); }
  100% { opacity: 1; transform: translateX(0);    }
}
@keyframes langFlagPop {
  0%   { transform: scale(1)    rotate(0);    }
  40%  { transform: scale(1.25) rotate(-8deg); }
  70%  { transform: scale(0.95) rotate(4deg);  }
  100% { transform: scale(1)    rotate(0);    }
}
@keyframes langRingPulse {
  0%   { box-shadow: 0 0 0 0   rgba(96,165,250,0.45); }
  100% { box-shadow: 0 0 0 8px rgba(96,165,250,0);    }
}
.lang-dd-enter   { animation: langDdEnter 180ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.lang-opt-enter  { animation: langOptionIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.lang-flag-pop   { animation: langFlagPop 360ms cubic-bezier(0.16, 1, 0.3, 1); }
.lang-ring-pulse { animation: langRingPulse 600ms ease-out; }
`

/** Compact language picker for the home header.  Renders as a single pill
 *  showing the active flag + code; click opens a tiny dropdown listing the
 *  other languages.  Outside-click closes the panel. */
export default function LanguageToggle(): React.JSX.Element {
  const { lang, setLang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  // `pulseKey` re-mounts the wrapper element to retrigger the animations
  // each time the language changes (CSS animations don't replay on their
  // own when re-applied to the same node).
  const [pulseKey, setPulseKey] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  const pick = (code: Lang) => {
    if (code !== lang) {
      setLang(code)
      setPulseKey((k) => k + 1)
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <style>{LANG_STYLE}</style>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('language')}
        className={[
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold',
          'border transition-[background-color,border-color,box-shadow] duration-150',
          open
            ? 'bg-slate-200 border-slate-400 text-slate-900 shadow-lg shadow-blue-500/20 dark:bg-slate-700 dark:border-slate-500 dark:text-white'
            : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-white hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/15 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:border-blue-400/50',
        ].join(' ')}
      >
        {/* Re-keyed wrapper retriggers the wiggle on language change. */}
        <span key={pulseKey} className={`text-base leading-none ${pulseKey > 0 ? 'lang-flag-pop' : ''}`}>{active.flag}</span>
        <span className="uppercase tracking-wide">{active.code}</span>
        <span className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
        {/* Outward ring pulse on language change. */}
        {pulseKey > 0 && (
          <span
            key={`ring-${pulseKey}`}
            aria-hidden
            className="absolute inset-0 rounded-lg lang-ring-pulse pointer-events-none"
          />
        )}
      </button>

      {open && (
        <div className="lang-dd-enter absolute right-0 top-full mt-1.5 z-50 min-w-[10rem] rounded-xl bg-white/95 border-slate-200 dark:bg-slate-800/95 dark:border-slate-600/80 backdrop-blur-md border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden">
          <div className="px-3 pt-2 pb-1 border-b border-slate-200 dark:border-slate-700/60">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('language')}
            </p>
          </div>
          <div className="py-1">
            {LANGUAGES.map((l, i) => {
              const isActive = l.code === lang
              return (
                <button
                  key={l.code}
                  onClick={() => pick(l.code)}
                  // Staggered fade-in for each row so the panel reads as
                  // animating, not just popping into existence.
                  style={{ animationDelay: `${60 + i * 50}ms` }}
                  className={[
                    'lang-opt-enter w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left',
                    'transition-[background-color,color,padding-left] duration-150',
                    isActive
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white hover:pl-4',
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
      )}
    </div>
  )
}
