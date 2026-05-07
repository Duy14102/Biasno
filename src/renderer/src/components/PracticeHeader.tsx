import React, { useState, useRef, useEffect } from 'react'
import type { PracticeMode } from '../types'

interface PracticeHeaderProps {
  songName:         string
  isPlaying:        boolean
  bpmMultiplier:    number
  originalBpm:      number
  metronomeOn:      boolean
  loopOn:           boolean
  countdownEnabled: boolean
  showSheetMusic:   boolean
  showFallingNotes: boolean
  mode:             PracticeMode
  volume:           number   // 0–1
  zoom:             number   // 0.5–2.0
  measureLines:     boolean
  onBack:               () => void
  onPlayPause:          () => void
  onRestart:            () => void
  onRewind:             () => void
  onFastForward:        () => void
  onBpmChange:          (val: number) => void
  onMetronomeToggle:    () => void
  onLoopToggle:         () => void
  onCountdownToggle:    () => void
  onSheetMusicToggle:   () => void
  onFallingNotesToggle: () => void
  onVolumeChange:       (val: number) => void
  onVolumeMute:         () => void
  onZoomChange:         (val: number) => void
  onMeasureLinesToggle: () => void
  onModeChange:         (mode: PracticeMode) => void
}

// ─── Mode config ──────────────────────────────────────────────────────────────
interface ModeItem { id: PracticeMode; sub: string }
interface ModeGroup { key: string; label: string | null; items: ModeItem[] }

const MODE_GROUPS: ModeGroup[] = [
  {
    key: 'view', label: null,
    items: [{ id: 'view-listen', sub: 'Xem & Nghe' }]
  },
  {
    key: 'right', label: 'Tay phải',
    items: [
      { id: 'right-melody',        sub: 'Melody' },
      { id: 'right-rhythm',        sub: 'Rhythm' },
      { id: 'right-melody-rhythm', sub: 'Melody + Rhythm' },
    ]
  },
  {
    key: 'left', label: 'Tay trái',
    items: [
      { id: 'left-melody',        sub: 'Melody' },
      { id: 'left-rhythm',        sub: 'Rhythm' },
      { id: 'left-melody-rhythm', sub: 'Melody + Rhythm' },
    ]
  },
  {
    key: 'both', label: 'Hai tay',
    items: [
      { id: 'both-melody',        sub: 'Melody' },
      { id: 'both-rhythm',        sub: 'Rhythm' },
      { id: 'both-melody-rhythm', sub: 'Melody + Rhythm' },
    ]
  },
]

// Colors keyed by group key — must be static strings for Tailwind to include them
const GROUP_COLORS: Record<string, { badge: string; header: string; item: string; dot: string }> = {
  view:  {
    badge:  'bg-violet-600/30 text-violet-200 border-violet-500/40 hover:bg-violet-600/50',
    header: 'text-violet-400',
    item:   'hover:bg-violet-900/30 text-violet-100',
    dot:    'bg-violet-400',
  },
  right: {
    badge:  'bg-blue-600/30 text-blue-200 border-blue-500/40 hover:bg-blue-600/50',
    header: 'text-blue-400',
    item:   'hover:bg-blue-900/30 text-blue-100',
    dot:    'bg-blue-400',
  },
  left: {
    badge:  'bg-orange-600/30 text-orange-200 border-orange-500/40 hover:bg-orange-600/50',
    header: 'text-orange-400',
    item:   'hover:bg-orange-900/30 text-orange-100',
    dot:    'bg-orange-400',
  },
  both: {
    badge:  'bg-green-600/30 text-green-200 border-green-500/40 hover:bg-green-600/50',
    header: 'text-green-400',
    item:   'hover:bg-green-900/30 text-green-100',
    dot:    'bg-green-400',
  },
}

function modeGroup(mode: PracticeMode): string {
  if (mode === 'view-listen')    return 'view'
  if (mode.startsWith('right-')) return 'right'
  if (mode.startsWith('left-'))  return 'left'
  return 'both'
}

function modeFullLabel(mode: PracticeMode): string {
  for (const g of MODE_GROUPS) {
    for (const item of g.items) {
      if (item.id === mode) return g.label ? `${g.label} · ${item.sub}` : item.sub
    }
  }
  return mode
}

// ─── ModeDropdown ─────────────────────────────────────────────────────────────
const ModeDropdown = React.memo(function ModeDropdown({
  mode, onModeChange
}: { mode: PracticeMode; onModeChange: (m: PracticeMode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const grp = modeGroup(mode)
  const col = GROUP_COLORS[grp]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Badge / trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors',
          col.badge
        ].join(' ')}
      >
        {modeFullLabel(mode)}
        <span className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-xl bg-slate-800 border border-slate-600 shadow-2xl shadow-black/60 py-1.5 overflow-hidden">
          {MODE_GROUPS.map((g, gi) => {
            const gc = GROUP_COLORS[g.key]
            return (
              <div key={g.key}>
                {gi > 0 && <div className="mx-3 my-1 border-t border-slate-700" />}

                {/* Group header */}
                {g.label && (
                  <div className={`px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider ${gc.header}`}>
                    {g.label}
                  </div>
                )}

                {/* Items */}
                {g.items.map((item) => {
                  const active = item.id === mode
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onModeChange(item.id); setOpen(false) }}
                      className={[
                        'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                        gc.item,
                        active ? 'font-semibold' : 'font-normal opacity-80 hover:opacity-100'
                      ].join(' ')}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${active ? gc.dot : 'bg-slate-600'}`} />
                      {g.label ? item.sub : item.sub}
                      {active && <span className="ml-auto text-[10px] opacity-60">✓</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

// ─── IconBtn ─────────────────────────────────────────────────────────────────
interface IconBtnProps {
  onClick: () => void
  title: string
  active?: boolean
  danger?: boolean
  children: React.ReactNode
}

const IconBtn = React.memo(function IconBtn({
  onClick, title, active = false, danger = false, children
}: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold transition-all',
        active
          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
          : danger
            ? 'bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white'
      ].join(' ')}
    >
      {children}
    </button>
  )
})

function volumeIcon(v: number): string {
  if (v === 0)   return '🔇'
  if (v < 0.35) return '🔈'
  if (v < 0.70) return '🔉'
  return '🔊'
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────
const SettingsPanel = React.memo(function SettingsPanel({
  volume, zoom, measureLines, countdownEnabled,
  onVolumeChange, onVolumeMute, onZoomChange, onMeasureLinesToggle, onCountdownToggle
}: {
  volume: number; zoom: number; measureLines: boolean; countdownEnabled: boolean
  onVolumeChange: (v: number) => void; onVolumeMute: () => void
  onZoomChange: (v: number) => void; onMeasureLinesToggle: () => void
  onCountdownToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Cài đặt"
        className={[
          'flex items-center justify-center w-9 h-9 rounded-lg text-sm transition-all',
          open
            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white'
        ].join(' ')}
      >
        ⚙
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-60 rounded-xl bg-slate-800 border border-slate-600 shadow-2xl shadow-black/60 p-3 flex flex-col gap-2.5">

          {/* Volume — single row: icon · slider · value */}
          <div className="flex items-center gap-2">
            <button
              onClick={onVolumeMute}
              title={volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'}
              className="text-base shrink-0 leading-none hover:scale-110 transition-transform"
            >
              {volumeIcon(volume)}
            </button>
            <input
              type="range" min={0} max={100} step={1}
              value={Math.round(volume * 100)}
              onChange={e => onVolumeChange(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
            />
            <span className="text-slate-300 text-xs font-mono w-7 text-right shrink-0">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Zoom — single row: 🔍 · slider · value */}
          <div className="flex items-center gap-2">
            <span className="text-sm shrink-0 leading-none select-none">🔍</span>
            <input
              type="range" min={50} max={200} step={5}
              value={Math.round(zoom * 100)}
              onChange={e => onZoomChange(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
            />
            <span className="text-slate-300 text-xs font-mono w-7 text-right shrink-0">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <div className="border-t border-slate-700" />

          {/* Lane lines toggle */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">Đường nhịp</span>
            <button
              onClick={onMeasureLinesToggle}
              style={{ padding: '2px' }}
              className={[
                'flex items-center w-10 h-5 rounded-full transition-colors shrink-0',
                measureLines ? 'bg-blue-500' : 'bg-slate-600'
              ].join(' ')}
            >
              <span
                className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: measureLines ? 'translateX(20px)' : 'translateX(0px)' }}
              />
            </button>
          </div>

          {/* Countdown toggle */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">Đếm ngược 3-2-1</span>
            <button
              onClick={onCountdownToggle}
              style={{ padding: '2px' }}
              className={[
                'flex items-center w-10 h-5 rounded-full transition-colors shrink-0',
                countdownEnabled ? 'bg-blue-500' : 'bg-slate-600'
              ].join(' ')}
            >
              <span
                className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: countdownEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
              />
            </button>
          </div>

        </div>
      )}
    </div>
  )
})

// ─── PracticeHeader ───────────────────────────────────────────────────────────
export default function PracticeHeader({
  songName, isPlaying, bpmMultiplier, originalBpm,
  metronomeOn, loopOn, countdownEnabled, showSheetMusic, showFallingNotes, mode,
  volume, zoom, measureLines,
  onBack, onPlayPause, onRestart, onRewind, onFastForward,
  onBpmChange, onMetronomeToggle, onLoopToggle, onCountdownToggle,
  onSheetMusicToggle, onFallingNotesToggle,
  onVolumeChange, onVolumeMute, onZoomChange, onMeasureLinesToggle, onModeChange
}: PracticeHeaderProps): React.JSX.Element {
  const currentBpm = Math.round(originalBpm * bpmMultiplier)

  return (
    <header className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700 select-none">
      {/* Back */}
      <IconBtn onClick={onBack} title="Quay lại" danger>←</IconBtn>

      {/* Song name */}
      <span className="text-slate-200 font-semibold text-sm truncate max-w-[120px] lg:max-w-[180px]" title={songName}>
        {songName}
      </span>

      {/* Mode dropdown badge */}
      <ModeDropdown mode={mode} onModeChange={onModeChange} />

      <div className="flex-1" />

      {/* Transport */}
      <div className="flex items-center gap-1.5">
        <IconBtn onClick={onRewind} title="Tua lại 5s">⏮</IconBtn>

        <button
          onClick={onPlayPause}
          title={isPlaying ? 'Dừng' : 'Phát'}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-blue-500 hover:bg-blue-400 text-white font-bold text-lg shadow-lg shadow-blue-500/30 transition-all"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <IconBtn onClick={onRestart} title="Bắt đầu lại từ đầu">↺</IconBtn>
        <IconBtn onClick={onFastForward} title="Tua tới 5s">⏭</IconBtn>

        <div className="w-px h-6 bg-slate-600 mx-1" />

        {/* BPM */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onBpmChange(Math.max(0.25, bpmMultiplier - 0.05))}
              className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold flex items-center justify-center"
              title="Giảm nhịp"
            >−</button>
            <div className="flex flex-col items-center">
              <span className="text-white text-sm font-bold font-mono w-12 text-center">
                {Math.round(bpmMultiplier * 100)}%
              </span>
              <span className="text-slate-500 text-xs font-mono">{currentBpm} BPM</span>
            </div>
            <button
              onClick={() => onBpmChange(Math.min(2.0, bpmMultiplier + 0.05))}
              className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold flex items-center justify-center"
              title="Tăng nhịp"
            >+</button>
          </div>
          <input
            type="range" min={25} max={200} step={5}
            value={Math.round(bpmMultiplier * 100)}
            onChange={(e) => onBpmChange(Number(e.target.value) / 100)}
            className="w-24 h-1 accent-blue-500 cursor-pointer"
          />
        </div>

        <button
          onClick={() => onBpmChange(1.0)}
          className="text-xs px-1.5 py-1 rounded transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          title="Về 100%"
        >
          100%
        </button>

        <div className="w-px h-6 bg-slate-600 mx-1" />

        <IconBtn onClick={onMetronomeToggle} title="Đếm nhịp" active={metronomeOn}>🥁</IconBtn>
        <IconBtn onClick={onLoopToggle} title={loopOn ? 'Tắt loop' : 'Bật loop'} active={loopOn}>🔁</IconBtn>
        <IconBtn onClick={onSheetMusicToggle}   title="Sheet nhạc" active={showSheetMusic}>🎼</IconBtn>
        <IconBtn onClick={onFallingNotesToggle} title="Note rơi"   active={showFallingNotes}>🎹</IconBtn>

        <div className="w-px h-6 bg-slate-600 mx-1" />

        {/* Settings */}
        <SettingsPanel
          volume={volume} zoom={zoom} measureLines={measureLines} countdownEnabled={countdownEnabled}
          onVolumeChange={onVolumeChange} onVolumeMute={onVolumeMute}
          onZoomChange={onZoomChange} onMeasureLinesToggle={onMeasureLinesToggle}
          onCountdownToggle={onCountdownToggle}
        />
      </div>
    </header>
  )
}
