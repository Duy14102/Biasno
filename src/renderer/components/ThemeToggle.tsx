import React, { useState } from 'react'
import { useTheme }    from '../context/ThemeContext'
import { useLanguage } from '../i18n/LanguageContext'

const THEME_STYLE = `
@keyframes themeIconPop {
  0%   { transform: scale(1)    rotate(0);    opacity: 1; }
  40%  { transform: scale(0.6)  rotate(-30deg); opacity: 0.6; }
  100% { transform: scale(1)    rotate(0);    opacity: 1; }
}
@keyframes themeRingPulse {
  0%   { box-shadow: 0 0 0 0   rgba(96,165,250,0.45); }
  100% { box-shadow: 0 0 0 8px rgba(96,165,250,0);    }
}
.theme-icon-pop   { animation: themeIconPop 360ms cubic-bezier(0.16, 1, 0.3, 1); }
.theme-ring-pulse { animation: themeRingPulse 600ms ease-out; }
`

export default function ThemeToggle(): React.JSX.Element {
  const { theme, toggle } = useTheme()
  const { t }             = useLanguage()
  const [pulseKey, setPulseKey] = useState(0)

  const isDark = theme === 'dark'
  const onClick = () => {
    toggle()
    setPulseKey((k) => k + 1)
  }

  return (
    <div className="relative">
      <style>{THEME_STYLE}</style>
      <button
        type="button"
        onClick={onClick}
        title={isDark ? t('themeDarkHint') : t('themeLightHint')}
        className={[
          'flex items-center justify-center w-8 h-8 rounded-lg',
          'border transition-[background-color,border-color,box-shadow] duration-150',
          'bg-slate-50 border-slate-300 text-slate-700 hover:bg-white hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/15',
          'dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:border-blue-400/50 dark:hover:shadow-blue-500/15',
        ].join(' ')}
      >
        <span key={pulseKey} className={`leading-none ${pulseKey > 0 ? 'theme-icon-pop' : ''}`}>
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 17a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zm10-8a1 1 0 0 1-1 1h-2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zM5 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zm13.66-6.66a1 1 0 0 1 0 1.41l-1.41 1.42a1 1 0 1 1-1.42-1.42l1.42-1.41a1 1 0 0 1 1.41 0zM7.17 16.83a1 1 0 0 1 0 1.41l-1.42 1.42a1 1 0 1 1-1.41-1.42l1.41-1.41a1 1 0 0 1 1.42 0zm11.49 1.41a1 1 0 0 1-1.41 1.42l-1.42-1.42a1 1 0 1 1 1.42-1.41l1.41 1.41zM7.17 7.17A1 1 0 0 1 5.76 8.59L4.34 7.17a1 1 0 0 1 1.41-1.41l1.42 1.41z" />
            </svg>
          )}
        </span>
        {pulseKey > 0 && (
          <span
            key={`ring-${pulseKey}`}
            aria-hidden
            className="absolute inset-0 rounded-lg theme-ring-pulse pointer-events-none"
          />
        )}
      </button>
    </div>
  )
}
