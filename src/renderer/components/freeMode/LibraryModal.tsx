import React, { useState } from 'react'
import { useLanguage } from '@/i18n'
import type { LibraryEntry } from '@/freeMode'
import { CloseIcon, TrashIcon, FolderMusicIcon, LibraryIcon, MicIcon } from './icons'
import { formatTimeMs, formatDateTime } from '@/utils'

interface Props {
  entries:    LibraryEntry[]
  activeId:   string | null
  onClose:    () => void
  onLoad:     (id: string) => void
  onDelete:   (id: string) => void
}

const LIB_STYLES = `
@keyframes lib-modal-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes lib-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes lib-row-in {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0);    }
}
.lib-modal    { animation: lib-modal-in    180ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.lib-backdrop { animation: lib-backdrop-in 160ms ease-out both; }
.lib-row      { animation: lib-row-in 220ms ease-out both; }
`

export default function LibraryModal({
  entries, activeId, onClose, onLoad, onDelete,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div
      className="lib-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <style>{LIB_STYLES}</style>
      <div
        className="lib-modal w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl shadow-black/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — colour band + title row */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />

        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-md shadow-violet-500/30">
              <LibraryIcon className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('freeLibrary')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {entries.length === 0
                  ? t('freeLibraryEmpty')
                  : t('freeLibrarySubtitle', { n: entries.length })}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
          >
            <CloseIcon className="w-4 h-4" />
            <span>{t('freeClose')}</span>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
          {entries.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="p-4 flex flex-col gap-2">
              {entries.map((e, i) => (
                <EntryRow
                  key={e.id}
                  index={i}
                  entry={e}
                  isActive={e.id === activeId}
                  isConfirming={confirmDelete === e.id}
                  onLoad={() => onLoad(e.id)}
                  onAskDelete={() => setConfirmDelete(e.id)}
                  onConfirmDelete={() => { onDelete(e.id); setConfirmDelete(null) }}
                  onCancelDelete={() => setConfirmDelete(null)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyState(): React.JSX.Element {
  const { t } = useLanguage()
  return (
    <div className="px-6 py-20 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/70 flex items-center justify-center text-slate-400 dark:text-slate-500">
        <MicIcon className="w-7 h-7" />
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {t('freeLibraryEmpty')}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
        {t('freeLibraryEmptyHint')}
      </p>
    </div>
  )
}

// ── One row in the list ────────────────────────────────────────────────────
function EntryRow({
  index, entry, isActive, isConfirming,
  onLoad, onAskDelete, onConfirmDelete, onCancelDelete,
}: {
  index: number
  entry: LibraryEntry
  isActive: boolean
  isConfirming: boolean
  onLoad: () => void
  onAskDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const { t } = useLanguage()
  return (
    <li
      className={[
        'lib-row group relative flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all',
        'cursor-pointer',
        isActive
          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50',
      ].join(' ')}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      onClick={() => !isActive && !isConfirming && onLoad()}
    >
      {/* Lead icon */}
      <div
        className={[
          'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
          isActive
            ? 'bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-md shadow-violet-500/30'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-300',
        ].join(' ')}
      >
        <FolderMusicIcon className="w-5 h-5" />
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
            {entry.name || t('freeUntitled')}
          </p>
          {isActive && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
              {t('freeLibraryActive')}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
          {entry.author && <span className="text-slate-600 dark:text-slate-300">{entry.author}</span>}
          {entry.author && <span> · </span>}
          <span className="font-mono">{formatTimeMs(entry.durationMs)}</span>
          <span> · </span>
          <span>{entry.notes.length} {t('freeNotes').toLowerCase()}</span>
          <span> · </span>
          <span>{formatDateTime(entry.updatedAt)}</span>
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {isConfirming ? (
          <>
            <button
              onClick={onConfirmDelete}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm active:scale-[0.97] transition-all"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              <span>{t('freeConfirm')}</span>
            </button>
            <button
              onClick={onCancelDelete}
              className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold active:scale-[0.97] transition-all"
            >
              {t('freeCancel')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onLoad}
              disabled={isActive}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm active:scale-[0.97] transition-all"
            >
              {t('freeLoad')}
            </button>
            <button
              onClick={onAskDelete}
              title={t('freeDelete')}
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </li>
  )
}
