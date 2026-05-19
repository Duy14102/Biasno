import React from 'react'
import type { PracticeMode } from '../../types'
import type { KeyCount } from '../../utils/noteUtils'
import IconBtn             from './IconBtn'
import ModeDropdown        from './ModeDropdown'
import SettingsPanel       from './SettingsPanel'
import KeyboardHelpPopover from './KeyboardHelpPopover'
import { useLanguage }     from '../../i18n/LanguageContext'
import {
  BackIcon, RewindIcon, FastFwdIcon, PlayIcon, PauseIcon, RestartIcon,
  MinusIcon, PlusIcon,
  MetronomeIcon, LoopIcon, SheetIcon, PianoIcon, LockIcon,
} from './icons'

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
  volume:           number   // 0 – 1
  zoom:             number   // 0.5 – 2.0
  measureLines:     boolean
  keyCount:         KeyCount
  keyCountLocked:   boolean
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
  onKeyCountChange:     () => void
}

export default function PracticeHeader({
  songName, isPlaying, bpmMultiplier, originalBpm,
  metronomeOn, loopOn, countdownEnabled, showSheetMusic, showFallingNotes, mode,
  volume, zoom, measureLines, keyCount, keyCountLocked,
  onBack, onPlayPause, onRestart, onRewind, onFastForward,
  onBpmChange, onMetronomeToggle, onLoopToggle, onCountdownToggle,
  onSheetMusicToggle, onFallingNotesToggle,
  onVolumeChange, onVolumeMute, onZoomChange, onMeasureLinesToggle, onModeChange,
  onKeyCountChange,
}: PracticeHeaderProps): React.JSX.Element {
  const { t } = useLanguage()
  const currentBpm  = Math.round(originalBpm * bpmMultiplier)
  const isCustomBpm = Math.abs(bpmMultiplier - 1.0) > 0.001

  return (
    <header className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 dark:bg-gradient-to-b dark:from-slate-800 dark:to-slate-900 border-b border-slate-300 dark:border-slate-700/70 select-none shadow-sm">

      {/* Identity cluster — back, title, mode */}
      <IconBtn onClick={onBack} title={t('back')} danger><BackIcon /></IconBtn>

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-800 dark:text-slate-100 font-semibold text-sm truncate max-w-[120px] lg:max-w-[200px]" title={songName}>
          {songName}
        </span>
        <ModeDropdown mode={mode} onModeChange={onModeChange} />
      </div>

      <div className="flex-1" />

      {/* Transport */}
      <div className="flex items-center gap-1.5">
        <IconBtn onClick={onRewind} title={t('rewind5s')}><RewindIcon /></IconBtn>

        <button
          onClick={onPlayPause}
          title={isPlaying ? t('pause') : t('play')}
          // Affordance via colour + shadow growth + a subtle outer ring on hover.
          // The play/pause glyph is an SVG now, so the surrounding-text blur
          // problem that previously blocked a scale tween is gone.
          className="flex items-center justify-center w-11 h-11 rounded-full bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 ring-2 ring-transparent hover:ring-blue-400/40 transition-[background-color,box-shadow,transform] duration-150 hover:scale-[1.04] active:scale-95"
        >
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>

        <IconBtn onClick={onRestart} title={t('restartFromStart')}><RestartIcon /></IconBtn>
        <IconBtn onClick={onFastForward} title={t('fastForward5s')}><FastFwdIcon /></IconBtn>
      </div>

      <div className="w-px h-7 bg-slate-300 dark:bg-slate-700/60" />

      {/* BPM cluster — % display doubles as the "reset to 100 %" button.
          Subtly highlights when off the default tempo so the user knows it's
          interactive AND that they're not at the natural rate. */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-300 dark:bg-slate-900/50 dark:border-slate-700/40">
        <button
          onClick={() => onBpmChange(Math.max(0.25, bpmMultiplier - 0.05))}
          className="w-6 h-6 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white flex items-center justify-center transition-[background-color,transform] duration-150 active:scale-90"
          title={t('decreaseBpm')}
        ><MinusIcon className="w-3.5 h-3.5" /></button>

        <button
          onClick={() => onBpmChange(1.0)}
          title={isCustomBpm ? t('resetTempo100') : t('defaultTempo')}
          className={[
            'flex flex-col items-center justify-center min-w-[3.25rem] px-1 py-0.5 rounded-md transition-colors',
            isCustomBpm
              ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:text-blue-200 dark:hover:bg-blue-500/15'
              : 'text-slate-900 dark:text-white cursor-default',
          ].join(' ')}
        >
          <span className="text-sm font-bold font-mono leading-tight">
            {Math.round(bpmMultiplier * 100)}%
          </span>
          <span className="text-[10px] text-slate-500 font-mono leading-tight">{currentBpm} BPM</span>
        </button>

        <button
          onClick={() => onBpmChange(Math.min(2.0, bpmMultiplier + 0.05))}
          className="w-6 h-6 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white flex items-center justify-center transition-[background-color,transform] duration-150 active:scale-90"
          title={t('increaseBpm')}
        ><PlusIcon className="w-3.5 h-3.5" /></button>

        <input
          type="range" min={25} max={200} step={5}
          value={Math.round(bpmMultiplier * 100)}
          onChange={(e) => onBpmChange(Number(e.target.value) / 100)}
          className="w-20 h-1 ml-1 accent-blue-500 cursor-pointer"
          title={t('dragTempo')}
        />
      </div>

      <div className="flex-1" />

      <div className="w-px h-7 bg-slate-300 dark:bg-slate-700/60" />

      {/* View toggles + tools */}
      <div className="flex items-center gap-1.5">
        <IconBtn onClick={onMetronomeToggle} title={t('metronome')}                                active={metronomeOn}><MetronomeIcon /></IconBtn>
        <IconBtn onClick={onLoopToggle}      title={loopOn ? t('loopOff') : t('loopOn')}           active={loopOn}><LoopIcon /></IconBtn>
        <IconBtn onClick={onSheetMusicToggle}   title={t('sheetMusic')}   active={showSheetMusic}><SheetIcon /></IconBtn>
        <IconBtn onClick={onFallingNotesToggle} title={t('fallingNotes')} active={showFallingNotes}><PianoIcon /></IconBtn>
        <button
          onClick={onKeyCountChange}
          disabled={keyCountLocked}
          title={keyCountLocked ? t('keyCountLocked', { n: keyCount }) : t('keyCountTitle', { n: keyCount })}
          className={[
            'flex items-center justify-center gap-1 h-9 px-2 min-w-[2.5rem] rounded-lg text-xs font-bold font-mono border',
            'transition-[background-color,border-color,box-shadow,transform] duration-150',
            keyCountLocked
              ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed opacity-70 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500'
              : 'bg-slate-100 border-slate-300 hover:bg-slate-200 hover:border-slate-400 hover:-translate-y-0.5 hover:shadow-md text-slate-700 dark:bg-slate-700 dark:border-transparent dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white',
          ].join(' ')}
        >
          {keyCountLocked && <LockIcon className="w-3 h-3" />}
          <span>{keyCount}</span>
        </button>
      </div>

      <div className="w-px h-7 bg-slate-300 dark:bg-slate-700/60" />

      <KeyboardHelpPopover />

      <SettingsPanel
        volume={volume} zoom={zoom} measureLines={measureLines} countdownEnabled={countdownEnabled}
        onVolumeChange={onVolumeChange} onVolumeMute={onVolumeMute}
        onZoomChange={onZoomChange} onMeasureLinesToggle={onMeasureLinesToggle}
        onCountdownToggle={onCountdownToggle}
      />
    </header>
  )
}
