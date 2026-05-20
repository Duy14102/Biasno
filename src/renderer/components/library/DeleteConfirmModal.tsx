import React, { useEffect } from 'react'
import type { FileEntry } from '../../context/AppContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { FolderIcon, ImportIcon } from './icons'

interface Props {
  entry:     FileEntry
  onCancel:  () => void
  onConfirm: () => void
}

/** Confirm dialog before removing a row from the library list.  Body copy
 *  varies by source so the user understands that we never touch the file
 *  on disk — only the in-app entry. */
export default function DeleteConfirmModal({ entry, onCancel, onConfirm }: Props): React.JSX.Element {
  const { t } = useLanguage()
  const isFolder = entry.source === 'folder'

  // Close on Escape for keyboard users.
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

        {/* Header — icon + title differ by source. */}
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className={[
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            isFolder ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
          ].join(' ')}>
            {isFolder ? <FolderIcon className="w-5 h-5" /> : <ImportIcon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 dark:text-white font-semibold text-base leading-snug">
              {t('removeFromListQuestion')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={entry.name}>
              {entry.name}
            </p>
          </div>
        </div>

        {/* Body — spells out what "delete" means for each source. */}
        <div className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {isFolder ? (
            <>
              <p>
                {t('folderEntryDescA')}<span className="text-amber-700 dark:text-amber-300 font-medium">{t('folderEntryDescB')}</span>{t('folderEntryDescC')}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {t('folderRescanNote')}
              </p>
            </>
          ) : (
            <>
              <p>
                {t('importEntryDescA')}<span className="text-blue-700 dark:text-blue-300 font-medium">{t('importEntryDescB')}</span>{t('importEntryDescC')}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {t('importAgainNote')}
              </p>
            </>
          )}
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
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            {t('deleteAction')}
          </button>
        </div>
      </div>
    </div>
  )
}
