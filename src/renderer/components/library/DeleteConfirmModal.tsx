import React, { useEffect } from 'react'
import type { FileEntry } from '../../context/AppContext'

interface Props {
  entry:     FileEntry
  onCancel:  () => void
  onConfirm: () => void
}

/** Confirm dialog before removing a row from the library list.  Body copy
 *  varies by source so the user understands that we never touch the file
 *  on disk — only the in-app entry. */
export default function DeleteConfirmModal({ entry, onCancel, onConfirm }: Props): React.JSX.Element {
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
        className="w-[420px] max-w-[92vw] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden"
        style={{ animation: 'fadeInUp 180ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <style>{`@keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }`}</style>

        {/* Header — icon + title differ by source. */}
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className={[
            'w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
            isFolder ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300',
          ].join(' ')}>
            {isFolder ? '🗂' : '📥'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-base leading-snug">
              Xóa khỏi danh sách?
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate" title={entry.name}>
              {entry.name}
            </p>
          </div>
        </div>

        {/* Body — spells out what "delete" means for each source. */}
        <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed">
          {isFolder ? (
            <>
              <p>
                Bài này thuộc <span className="text-amber-300 font-medium">thư mục đã chọn</span>.
                Xóa sẽ gỡ khỏi danh sách trong Biasno
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Lưu ý: nếu bạn quét lại thư mục, bài sẽ xuất hiện trở lại.
              </p>
            </>
          ) : (
            <>
              <p>
                Bài này là <span className="text-blue-300 font-medium">file import</span>.
                Xóa sẽ gỡ khỏi danh sách trong Biasno
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Bạn có thể import lại bất cứ lúc nào.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            Xóa
          </button>
        </div>
      </div>
    </div>
  )
}
