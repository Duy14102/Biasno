import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/i18n'
import type { Clip } from '@/freeMode'

// Right-click context menu for the trim bar.  Hosts the per-clip / per-gap
// operations: split, copy, paste, delete, comment, volume, lock/unlock.
// Items disable themselves based on what the click position points at (a
// clip vs. a gap; locked vs. unlocked) so the menu always reads as "all
// options visible, only the meaningful ones live".

export interface ClipMenuActions {
  onSplit:       (atMs: number) => void
  onCopy:        (atMs: number) => void
  onPaste:       (atMs: number) => void
  onDelete:      (atMs: number) => void
  onSetComment:  (atMs: number, comment: string) => void
  onSetVolume:   (atMs: number, volume: number) => void
  onToggleLock:  (atMs: number) => void
}

interface Props {
  // Anchor in viewport coords (the right-click position).
  x:        number
  y:        number
  // The recording-time position the menu refers to for clip-targeted ops
  // (copy / delete / comment / volume / lock / clone / paste).  Comes from
  // where the user right-clicked.
  atMs:     number
  // Where Split should cut.  Comes from the playhead position so the user
  // can place the cut precisely with a left-click and then trigger the cut
  // from anywhere via right-click → Split (Premiere/Final-Cut convention).
  splitAtMs: number
  // Clip the cursor landed on, or null if in a gap / outside trim.
  clipHere: Clip | null
  // Is there something on the clipboard ready to paste?
  hasClipboard: boolean
  onClose:  () => void
  actions:  ClipMenuActions
}

type SubEditor = null | 'comment' | 'volume'

export default function ClipContextMenu({
  x, y, atMs, splitAtMs, clipHere, hasClipboard, onClose, actions,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)
  const [sub, setSub] = useState<SubEditor>(null)
  const [draftComment, setDraftComment] = useState(clipHere?.comment ?? '')
  const [draftVolume,  setDraftVolume]  = useState(clipHere?.volume ?? 1)

  const onClip   = clipHere !== null
  const editable = onClip && !clipHere!.locked

  // Position the panel so it stays on-screen; flip to the left / above if
  // there isn't room.
  const style = useMemo<React.CSSProperties>(() => {
    const PAD = 8
    const w = 240, h = 320  // generous reservation for clamping
    const left = Math.min(x, window.innerWidth  - w - PAD)
    const top  = Math.min(y, window.innerHeight - h - PAD)
    return { left: Math.max(PAD, left), top: Math.max(PAD, top) }
  }, [x, y])

  // Dismiss on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Capture phase: clip mousedown handlers call stopPropagation(), which
    // would otherwise prevent this listener from firing and leave the menu
    // stuck open after a left-click on another clip.
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown',   onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  const close = () => onClose()
  const run = (fn: () => void) => () => { fn(); close() }

  // Portal to document.body so we escape any transformed / filtered ancestor
  // (RecorderPanel's .fm-card animates with translateY, which would otherwise
  // become the containing block for position:fixed and pin the menu inside
  // the card instead of at the cursor).
  return createPortal(
    <div
      ref={rootRef}
      style={style}
      className="fixed z-[60] min-w-[200px] py-1.5 rounded-lg shadow-2xl shadow-black/40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        label={t('clipMenuSplit')}
        kbd="S"
        disabled={!editable}
        onClick={run(() => actions.onSplit(splitAtMs))}
      />
      <MenuItem
        label={t('clipMenuCopy')}
        disabled={!onClip}
        onClick={run(() => actions.onCopy(atMs))}
      />
      <MenuItem
        label={t('clipMenuPaste')}
        disabled={!hasClipboard}
        onClick={run(() => actions.onPaste(atMs))}
      />
      <MenuItem
        label={t('clipMenuDelete')}
        disabled={!editable}
        danger
        onClick={run(() => actions.onDelete(atMs))}
      />

      <MenuDivider />

      <MenuItem
        label={t('clipMenuComment')}
        disabled={!editable}
        active={sub === 'comment'}
        onClick={() => setSub(sub === 'comment' ? null : 'comment')}
      />
      {sub === 'comment' && editable && (
        <div className="px-3 py-2 flex flex-col gap-2 border-y border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60">
          <input
            autoFocus
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { actions.onSetComment(atMs, draftComment); close() }
            }}
            placeholder={t('clipMenuCommentPlaceholder')}
            maxLength={120}
            className="px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { actions.onSetComment(atMs, ''); close() }}
              className="px-2 py-1 rounded-md text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {t('clipMenuClear')}
            </button>
            <button
              onClick={() => { actions.onSetComment(atMs, draftComment); close() }}
              className="px-2 py-1 rounded-md text-[11px] bg-blue-600 hover:bg-blue-500 text-white"
            >
              {t('clipMenuSave')}
            </button>
          </div>
        </div>
      )}

      <MenuItem
        label={t('clipMenuVolume')}
        disabled={!editable}
        active={sub === 'volume'}
        suffix={onClip ? `${Math.round(clipHere!.volume * 100)}%` : undefined}
        onClick={() => setSub(sub === 'volume' ? null : 'volume')}
      />
      {sub === 'volume' && editable && (
        <div className="px-3 py-2 flex flex-col gap-1.5 border-y border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{t('clipMenuVolume')}</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
              {Math.round(draftVolume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0} max={2} step={0.05}
            value={draftVolume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setDraftVolume(v)
              actions.onSetVolume(atMs, v)
            }}
            className="w-full accent-blue-500"
          />
        </div>
      )}

      <MenuItem
        label={onClip && clipHere!.locked ? t('clipMenuUnlock') : t('clipMenuLock')}
        disabled={!onClip}
        onClick={run(() => actions.onToggleLock(atMs))}
      />
    </div>,
    document.body,
  )
}

function MenuItem({
  label, onClick, disabled, danger, active, suffix, kbd,
}: {
  label:    string
  onClick:  () => void
  disabled?: boolean
  danger?:   boolean
  active?:   boolean
  suffix?:   string
  kbd?:      string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left',
        'transition-colors',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : danger
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
            : active
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      <span>{label}</span>
      <span className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
        {suffix && <span className="tabular-nums">{suffix}</span>}
        {kbd && <kbd className="px-1 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300">{kbd}</kbd>}
      </span>
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-slate-200 dark:bg-slate-700/60" />
}
