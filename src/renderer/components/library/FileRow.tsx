import React from 'react'
import type { FileEntry } from '../../context/AppContext'
import { MusicBars, FolderIcon, ImportIcon, TrashIcon } from './icons'

function formatDur(s?: number): string {
  if (!s) return ''
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

interface Props {
  entry:        FileEntry
  isLoading:    boolean
  isHovered:    boolean
  onHoverChange: (hovered: boolean) => void
  onClick:      () => void
  onDelete:     () => void
}

/** One row in the library file list.  Layout is a single fixed-height line so
 *  the list never reflows when an entry switches into / out of loading. */
export default function FileRow({
  entry, isLoading, isHovered, onHoverChange, onClick, onDelete,
}: Props): React.JSX.Element {
  const isFolder = entry.source === 'folder'
  return (
    <div
      className={[
        'group px-4 py-2.5 cursor-pointer transition-colors duration-100 border-l-2 relative overflow-hidden',
        isLoading
          ? 'bg-blue-900/25 border-blue-500'
          : isHovered
            ? 'bg-slate-800 border-blue-500'
            : 'border-transparent hover:bg-slate-800/50 hover:border-slate-600',
      ].join(' ')}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={() => !isLoading && onClick()}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Leading icon: spinner / hover-bars / source-tagged glyph. */}
        <div
          className={[
            'flex-shrink-0 w-5 h-5 flex items-center justify-center',
            isFolder ? 'text-amber-400/90' : 'text-blue-400/90',
          ].join(' ')}
          title={isFolder
            ? (entry.folderPath ? `Từ thư mục: ${entry.folderPath}` : 'Từ thư mục')
            : 'File đã import'}
        >
          {isLoading
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-blue-300/40 border-t-blue-400 rounded-full animate-spin" />
            : isHovered
              ? <MusicBars />
              : (isFolder ? <FolderIcon /> : <ImportIcon />)}
        </div>

        {/* Name */}
        <span className="flex-1 text-sm text-slate-200 truncate font-medium min-w-0">
          {entry.name}
        </span>

        {/* Right-side meta: duration / "Đang tải" / delete trash. */}
        {isLoading ? (
          <span className="text-xs font-mono flex-shrink-0 ml-1 tabular-nums text-blue-300">
            Đang tải
          </span>
        ) : isHovered ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="Xóa khỏi danh sách"
            className="flex-shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
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
        <div className="absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden bg-blue-900/30">
          <div className="h-full w-1/3 bg-blue-400/90 rounded-full animate-[loadingbar_1.2s_ease-in-out_infinite]" />
        </div>
      )}
    </div>
  )
}
