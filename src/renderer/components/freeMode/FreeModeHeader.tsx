import React from 'react'
import { IconBtn } from '@/components/header'
import { BackIcon } from '@/components/header'
import { LibraryIcon } from './icons'
import { useLanguage } from '@/i18n'

interface Props {
  onBack:        () => void
  onOpenLibrary: () => void
  libraryCount:  number
}

export default function FreeModeHeader({ onBack, onOpenLibrary, libraryCount }: Props): React.JSX.Element {
  const { t } = useLanguage()
  return (
    <header className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 dark:bg-gradient-to-b dark:from-slate-800 dark:to-slate-900 border-b border-slate-300 dark:border-slate-700/70 select-none shadow-sm">
      <IconBtn onClick={onBack} title={t('back')} danger><BackIcon /></IconBtn>

      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 via-fuchsia-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-fuchsia-500/30 ring-1 ring-white/10">
          {/* Tiny mic decoration — reuses the recorder iconography. */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.91-3a.5.5 0 0 0-.5.5 5.41 5.41 0 1 1-10.82 0 .5.5 0 0 0-.5-.5h-.5a.5.5 0 0 0-.5.5 6.91 6.91 0 0 0 6.41 6.88V21a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-2.62A6.91 6.91 0 0 0 18.91 11.5a.5.5 0 0 0-.5-.5h-.5z"/>
          </svg>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-slate-800 dark:text-slate-100 font-semibold text-sm">
            {t('freeMode')}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium">
            {t('freeModeSubtitle')}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <button
        onClick={onOpenLibrary}
        className="group flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all active:scale-[0.97] shadow-sm"
        title={t('freeLibrary')}
      >
        <LibraryIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        <span>{t('freeLibrary')}</span>
        {libraryCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-br from-blue-500 to-violet-500 text-white text-[10px] font-mono tabular-nums shadow-sm group-hover:shadow-md transition-shadow">
            {libraryCount}
          </span>
        )}
      </button>
    </header>
  )
}
