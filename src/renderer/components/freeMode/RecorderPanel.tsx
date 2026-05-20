import React, { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import type { FreeSnapshot } from '../../freeMode/types'
import TrimRange         from './TrimRange'
import ExportMenu        from './ExportMenu'
import SpeedControl      from './SpeedControl'
import ClearConfirmModal from './ClearConfirmModal'
import {
  PlayIcon, PauseIcon, StopIcon,
  UndoIcon, RedoIcon, TrashIcon, ScissorsIcon,
  PlusCircleIcon,
} from './icons'

interface Props {
  isRecording:  boolean
  isPlaying:    boolean
  snapshot:     FreeSnapshot
  fileName:     string
  setFileName:  (s: string) => void
  author:       string
  setAuthor:    (s: string) => void
  canUndo:      boolean
  canRedo:      boolean
  onRecord:     () => void
  onContinue:   () => void
  onStop:       () => void
  onPlay:       () => void
  onPlayStop:   () => void
  playbackMs:   number
  onClear:      () => void
  onUndo:       () => void
  onRedo:       () => void
  onDraftStart:  (ms: number) => void
  onDraftEnd:    (ms: number) => void
  onCommitStart: (ms: number) => void
  onCommitEnd:   (ms: number) => void
  draftStartMs:  number
  draftEndMs:    number
  onExportMidi: () => void
  onExportXml:  () => void
  onExportPdf:  () => void
  liveRecordMs: number
  busyExport:   null | 'midi' | 'xml' | 'pdf'
  speed:        number
  onSpeedChange: (s: number) => void
  onSeek:       (ms: number) => void
}

const PANEL_STYLES = `
@keyframes fm-card-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes fm-rec-dot {
  0%, 100% { opacity: 1;   transform: scale(1);    }
  50%      { opacity: 0.4; transform: scale(0.85); }
}
@keyframes fm-section-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.fm-card    { animation: fm-card-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.fm-rec-dot { animation: fm-rec-dot 1.1s ease-in-out infinite; }
.fm-section { animation: fm-section-in 280ms ease-out both; }
`

function fmt(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export default function RecorderPanel({
  isRecording, isPlaying, snapshot, fileName, setFileName, author, setAuthor,
  canUndo, canRedo,
  onRecord, onContinue, onStop, onPlay, onPlayStop, onClear, onUndo, onRedo,
  onDraftStart, onDraftEnd, onCommitStart, onCommitEnd, draftStartMs, draftEndMs,
  onExportMidi, onExportXml, onExportPdf,
  liveRecordMs, busyExport, playbackMs,
  speed, onSpeedChange, onSeek,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  const hasRecording = snapshot.notes.length > 0 && snapshot.durationMs > 0
  const [confirmingClear, setConfirmingClear] = useState(false)

  // The panel sits between the header and the keyboard.  Use flex centering
  // so the card hugs its content vertically (no forced scroll), with a
  // sensible max-width so wide screens don't stretch inputs full-bleed.
  return (
    <div className="flex-1 min-h-0 flex items-start justify-center overflow-y-auto px-4 md:px-8 py-6">
      <style>{PANEL_STYLES}</style>

      <div className="fm-card w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/70 shadow-xl shadow-slate-900/5 dark:shadow-black/40 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />

        <div className="p-5 md:p-6 flex flex-col gap-5">

          {/* ── Row 1 — Record + meta + transport (always visible) ───── */}
          <div className="flex flex-wrap items-center gap-4">
            <RecordPill
              isRecording={isRecording}
              disabled={isPlaying}
              onClick={isRecording ? onStop : onRecord}
              recordLabel={t('freeRecord')}
              stopLabel={t('freeStop')}
              reRecordLabel={t('freeRecordAgain')}
              hasRecording={hasRecording}
            />

            {hasRecording && !isRecording && (
              <button
                onClick={onContinue}
                disabled={isPlaying}
                className="flex items-center gap-2 px-4 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-semibold shadow-md shadow-amber-500/25 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition-all"
                title={t('freeContinueHint')}
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>{t('freeContinue')}</span>
              </button>
            )}

            {/* Live recording read-out.  Only shown WHILE recording — when
                there's already a take, the trim range below already shows
                its duration, so the big timer here is just noise. */}
            {isRecording && (
              <MetaInline
                ms={liveRecordMs}
                notesCount={snapshot.notes.length}
                notesLabel={t('freeNotes').toLowerCase()}
              />
            )}

            <div className="flex-1" />

            {hasRecording && !isRecording && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={isPlaying ? onPlayStop : onPlay}
                  className="flex items-center gap-2 px-4 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-md shadow-emerald-500/25 active:scale-[0.97] transition-all"
                >
                  {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                  <span>{isPlaying ? t('freePause') : t('freePlay')}</span>
                </button>
                <SpeedControl speed={speed} onChange={onSpeedChange} />
                <IconBtnOnly icon={<UndoIcon  className="w-4 h-4" />} onClick={onUndo}  disabled={!canUndo} title={t('freeUndo')} />
                <IconBtnOnly icon={<RedoIcon  className="w-4 h-4" />} onClick={onRedo}  disabled={!canRedo} title={t('freeRedo')} />
                <IconBtnOnly icon={<TrashIcon className="w-4 h-4" />} onClick={() => setConfirmingClear(true)} title={t('freeClearHint')} variant="danger" />
                <ExportMenu
                  onMidi={onExportMidi} onXml={onExportXml} onPdf={onExportPdf}
                  busy={busyExport} disabled={busyExport !== null}
                />
              </div>
            )}
          </div>

          {/* ── State hint (idle / recording) ─────────────────────────── */}
          {(isRecording || !hasRecording) && (
            <p
              key={isRecording ? 'rec' : 'idle'}
              className={[
                'fm-section text-xs text-center px-4 py-1.5',
                isRecording ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400',
              ].join(' ')}
            >
              {isRecording ? t('freeRecordingHint') : t('freeIdleHint')}
            </p>
          )}

          {/* ── Edit block — name / author / trim / export ─────────────── */}
          {confirmingClear && (
            <ClearConfirmModal
              name={fileName}
              onCancel={() => setConfirmingClear(false)}
              onConfirm={() => { setConfirmingClear(false); onClear() }}
            />
          )}

          {hasRecording && !isRecording && (
            <div className="fm-section flex flex-col gap-5 pt-1 border-t border-slate-200 dark:border-slate-700/60">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 pt-4">
                <FieldInput
                  label={t('freeFileName')}
                  value={fileName} onChange={setFileName}
                  placeholder={t('freeFileNamePlaceholder')}
                />
                <FieldInput
                  label={t('freeAuthor')}
                  value={author} onChange={setAuthor}
                  placeholder={t('freeAuthorPlaceholder')}
                />
              </div>

              <div className="flex flex-col gap-2">
                <SectionLabel icon={<ScissorsIcon className="w-3.5 h-3.5" />} text={t('freeTrimRange')} />
                <TrimRange
                  min={0}
                  max={snapshot.durationMs}
                  startMs={draftStartMs}
                  endMs={draftEndMs}
                  notes={snapshot.notes}
                  onDraftStart={onDraftStart}
                  onDraftEnd={onDraftEnd}
                  onCommitStart={onCommitStart}
                  onCommitEnd={onCommitEnd}
                  formatMs={fmt}
                  playbackMs={playbackMs}
                  playbackActive={isPlaying}
                  onSeek={onSeek}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RecordPill({
  isRecording, disabled, onClick, recordLabel, stopLabel, reRecordLabel, hasRecording,
}: {
  isRecording: boolean; disabled: boolean; onClick: () => void
  recordLabel: string; stopLabel: string; reRecordLabel: string; hasRecording: boolean
}) {
  const label = isRecording ? stopLabel : hasRecording ? reRecordLabel : recordLabel
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center gap-2.5 px-5 h-11 rounded-xl',
        'text-white text-sm font-semibold transition-all',
        'active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        isRecording
          ? 'bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 ring-2 ring-red-500/70 shadow-md shadow-red-500/30'
          : 'bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 shadow-md shadow-red-500/30',
      ].join(' ')}
    >
      {isRecording ? (
        <>
          <StopIcon className="w-4 h-4" />
          <span>{label}</span>
        </>
      ) : (
        <>
          <span className="w-2.5 h-2.5 rounded-full bg-white" aria-hidden />
          <span>{label}</span>
        </>
      )}
    </button>
  )
}

// Recording-only readout: large red counter + notes count + REC badge.
// Outside of `isRecording`, the trim range already shows the take's
// duration, so this lives inside the panel only while a take is being
// captured.
function MetaInline({
  ms, notesCount, notesLabel,
}: {
  ms: number; notesCount: number; notesLabel: string
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-mono font-bold tabular-nums text-2xl md:text-3xl tracking-tight text-red-600 dark:text-red-400">
        {fmt(ms)}
      </span>

      <span className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="w-px h-5 bg-slate-300 dark:bg-slate-700" />
        <span>
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 text-sm">{notesCount}</span>
          {' '}{notesLabel}
        </span>
      </span>

      <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold tracking-wide">
        <span className="fm-rec-dot w-1.5 h-1.5 rounded-full bg-red-500" />
        REC
      </span>
    </div>
  )
}

function SectionLabel({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
      {icon}
      <span>{text}</span>
    </div>
  )
}

function FieldInput({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (s: string) => void; placeholder: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <SectionLabel text={label} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
        className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
      />
    </label>
  )
}

function IconBtnOnly({
  icon, onClick, disabled, title, variant,
}: {
  icon: React.ReactNode; onClick: () => void; disabled?: boolean; title: string;
  variant?: 'danger'
}) {
  const tone = variant === 'danger'
    ? 'bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 dark:bg-slate-800 dark:hover:bg-red-900/40 dark:text-slate-300 dark:hover:text-red-300'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'w-11 h-11 flex items-center justify-center rounded-xl transition-all',
        'active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        tone,
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

