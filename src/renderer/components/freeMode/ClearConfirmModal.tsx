import React, { useEffect } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { TrashIcon } from './icons'

interface Props {
  // Name of the draft being cleared — surfaces in the dialog body so the
  // user is sure which take is about to go.
  name:      string
  onCancel:  () => void
  onConfirm: () => void
}

// Confirm dialog for clearing the working draft.  Mirrors
// `library/DeleteConfirmModal` visually so the gesture feels familiar.
// Clearing doesn't delete the library entry — that's spelled out in the
// body copy.
export default function ClearConfirmModal({ name, onCancel, onConfirm }: Props): React.JSX.Element {
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
        className="w-[420px] max-w-[92vw] rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 shadow-2xl overflow-hidden"
        style={{ animation: 'fadeInUp 180ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <style>{`@keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }`}</style>

        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 flex items-center justify-center flex-shrink-0">
            <TrashIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 dark:text-white font-semibold text-base leading-snug">
              {t('freeClearConfirmTitle')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={name}>
              {name || t('freeUntitled')}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>{t('freeClearConfirmBody')}</p>
          <p className="mt-2 text-xs text-slate-500">{t('freeClearConfirmNote')}</p>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 text-sm font-medium transition-colors"
          >
            {t('freeCancel')}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            {t('freeClear')}
          </button>
        </div>
      </div>
    </div>
  )
}
