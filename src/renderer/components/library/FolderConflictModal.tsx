import React, { useEffect } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'

interface Props {
  folder:    string
  conflicts: Array<{ name: string; path: string }>
  onCancel:  () => void
  onConfirm: () => void
}

/** Confirm dialog shown when the user picks a folder that contains MIDI
 *  files they previously removed from the song list.  Confirming un-hides
 *  those paths so syncFolder brings them back; cancelling leaves the
 *  current folder selection unchanged. */
export default function FolderConflictModal({
  folder, conflicts, onCancel, onConfirm,
}: Props): React.JSX.Element {
  const { t } = useLanguage()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-[92vw] rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 shadow-2xl overflow-hidden"
        style={{ animation: 'fadeInUp 180ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <style>{`@keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }`}</style>

        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            ⚠
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 dark:text-white font-semibold text-base leading-snug">
              {t('folderConflictTitle')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={folder}>
              {folder}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>{t('folderConflictDesc', { n: conflicts.length })}</p>
          <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-400">
            {conflicts.map((c) => (
              <li key={c.path} className="truncate" title={c.path}>{c.name}</li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 text-sm font-medium transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors"
          >
            {t('folderConflictAdd')}
          </button>
        </div>
      </div>
    </div>
  )
}
