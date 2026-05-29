import React from 'react'
import type { FileEntry } from '@/context'
import { MusicBars, FolderIcon, ImportIcon, TrashIcon } from './icons'
import { highlightMatch } from './highlightMatch'
import { useLanguage } from '@/i18n'
import { formatTimeSec } from '@/utils'

const formatDur = (s?: number): string => (s ? formatTimeSec(s) : '')

interface Props {
  entry:              FileEntry
  isLoading:          boolean
  isHovered:          boolean
  currentFolderPath?: string | null
  query?:             string
  onHoverChange:      (hovered: boolean) => void
  onClick:            () => void
  onDelete:           () => void
}

/** One row in the library file list.  Fixed height (FILE_ROW_HEIGHT) so the
 *  virtualized list can window with pure arithmetic and never reflows when an
 *  entry switches into / out of loading. */
export default function FileRow({
  entry, isLoading, isHovered, currentFolderPath, query = '', onHoverChange, onClick, onDelete,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  const isFolder = entry.source === 'folder'
  const showFolderPath = isFolder && !!entry.folderPath
  const isInCurrentFolder = showFolderPath && entry.folderPath === currentFolderPath
  return (
    <div
      className={[
        'group h-14 px-4 flex items-center cursor-pointer transition-colors duration-100 border-l-2 relative overflow-hidden',
        isLoading
          ? 'bg-blue-100 border-blue-500 dark:bg-blue-900/25'
          : isHovered
            ? 'bg-slate-100 border-blue-500 dark:bg-slate-800'
            : 'border-transparent hover:bg-slate-100/70 hover:border-slate-300 dark:hover:bg-slate-800/50 dark:hover:border-slate-600',
      ].join(' ')}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={() => !isLoading && onClick()}
    >
      <div className="flex items-center gap-2 min-w-0 w-full">
        {/* Leading icon: spinner / hover-bars / source-tagged glyph. */}
        <div
          className={[
            'flex-shrink-0 w-5 h-5 flex items-center justify-center',
            isFolder ? 'text-amber-600 dark:text-amber-400/90' : 'text-blue-600 dark:text-blue-400/90',
          ].join(' ')}
          title={isFolder
            ? (entry.folderPath ? t('fromFolderWithPath', { path: entry.folderPath }) : t('fromFolder'))
            : t('importedFile')}
        >
          {isLoading
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-blue-300/40 border-t-blue-400 rounded-full animate-spin" />
            : isHovered
              ? <MusicBars />
              : (isFolder ? <FolderIcon /> : <ImportIcon />)}
        </div>

        {/* Name + (folder source) path subtitle */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-800 dark:text-slate-200 truncate font-medium">
            {highlightMatch(entry.name, query)}
          </div>
          {showFolderPath && (
            <div
              className={[
                'flex items-center gap-1 text-[11px] leading-tight mt-0.5 min-w-0',
                isInCurrentFolder
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400',
              ].join(' ')}
              title={entry.folderPath!}
            >
              <FolderIcon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate font-mono">{highlightMatch(entry.folderPath!, query)}</span>
            </div>
          )}
        </div>

        {/* Right-side meta: duration / "Đang tải" / delete trash. */}
        {isLoading ? (
          <span className="text-xs font-mono flex-shrink-0 ml-1 tabular-nums text-blue-600 dark:text-blue-300">
            {t('loadingShort')}
          </span>
        ) : isHovered ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title={t('removeFromListShort')}
            className="flex-shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/20 dark:hover:text-red-300 transition-colors"
          >
            <TrashIcon />
          </button>
        ) : (
          <span className="text-xs font-mono flex-shrink-0 ml-1 tabular-nums text-slate-500">
            {formatDur(entry.duration)}
          </span>
        )}
      </div>

      {/* Indeterminate progress bar pinned to the row's bottom edge.
          Absolute → does not contribute to row height. */}
      {isLoading && (
        <div className="absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden bg-blue-200/70 dark:bg-blue-900/30">
          <div className="h-full w-1/3 bg-blue-400/90 rounded-full animate-[loadingbar_1.2s_ease-in-out_infinite]" />
        </div>
      )}
    </div>
  )
}
