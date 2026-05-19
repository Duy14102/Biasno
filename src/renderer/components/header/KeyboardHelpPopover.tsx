// Computer-keyboard cheat-sheet, surfaced as a popover from the practice
// header. Two stacked mini-octaves showing how the QWERTY rows map onto the
// piano:
//   • Lower (Z + A-row blacks)    → C3 .. E4
//   • Upper (Q + number-row blacks) → F4 .. A5
// The two halves are contiguous so chord runs across both rows work.

import React, { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { useMidi }     from '../../context/MidiContext'
import { DROPDOWN_CSS } from './modeGroups'
import { KeyboardIcon, LockIcon } from './icons'

interface OctaveRow {
  whites: string[]                                    // 10 white-key letters left-to-right
  blacks: Array<{ letter: string; afterIdx: number }> // afterIdx = which white-key gap the black sits over
}

const LOWER: OctaveRow = {
  whites: ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'],
  blacks: [
    { letter: 'S', afterIdx: 0 },
    { letter: 'D', afterIdx: 1 },
    { letter: 'G', afterIdx: 3 },
    { letter: 'H', afterIdx: 4 },
    { letter: 'J', afterIdx: 5 },
    { letter: 'L', afterIdx: 7 },
    { letter: ';', afterIdx: 8 },
  ],
}

const UPPER: OctaveRow = {
  whites: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  blacks: [
    { letter: '2', afterIdx: 0 },
    { letter: '3', afterIdx: 1 },
    { letter: '4', afterIdx: 2 },
    { letter: '6', afterIdx: 4 },
    { letter: '7', afterIdx: 5 },
    { letter: '9', afterIdx: 7 },
    { letter: '0', afterIdx: 8 },
  ],
}

// Hover wiggle for the trigger glyph; gentle floaty drift for the header icon
// in the dropdown body.
const KBD_CSS = `
@keyframes kbdWiggle {
  0%, 100% { transform: rotate(0); }
  25%      { transform: rotate(-8deg); }
  75%      { transform: rotate(8deg);  }
}
@keyframes kbdFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
}
.kbd-trigger:hover .kbd-glyph { animation: kbdWiggle 360ms ease-in-out; }
.kbd-header-icon              { animation: kbdFloat 2400ms ease-in-out infinite; }
`

export default function KeyboardHelpPopover(): React.JSX.Element {
  const { t } = useLanguage()
  const { connectedId } = useMidi()
  const locked = connectedId !== null
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close the popover automatically when a piano gets connected mid-view so
  // the stale "use computer keys" hint doesn't linger.
  useEffect(() => { if (locked) setOpen(false) }, [locked])

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
      <style>{DROPDOWN_CSS}</style>
      <style>{KBD_CSS}</style>

      <button
        onClick={() => setOpen(v => !v)}
        disabled={locked}
        title={locked ? t('keyboardHelpLocked') : t('keyboardHelpTitle')}
        className={[
          'kbd-trigger relative flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold',
          'transition-[background-color,border-color,box-shadow,transform] duration-150',
          locked
            ? 'bg-slate-100 border border-slate-300 text-slate-400 cursor-not-allowed opacity-70 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500'
            : 'hover:-translate-y-0.5 active:translate-y-0 ' + (open
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40'
              : 'bg-slate-100 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 hover:shadow-md hover:shadow-blue-500/10 text-slate-700 dark:bg-slate-700 dark:border-transparent dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white'),
        ].join(' ')}
      >
        <span className="kbd-glyph inline-flex leading-none">
          <KeyboardIcon />
        </span>
        {locked && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-slate-500 text-white shadow dark:bg-slate-600">
            <LockIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {open && !locked && (
        <div className="hdr-dd-enter absolute right-0 top-full mt-2 z-50 w-[26rem] rounded-2xl bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700 border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden origin-top-right">

          <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-blue-50 to-slate-50 dark:from-slate-800 dark:to-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2.5">
              <div className="kbd-header-icon flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 text-white shadow-md shadow-blue-500/30">
                <KeyboardIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col leading-tight">
                <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                  {t('keyboardHelpTitle')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('keyboardHelpHint')}
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div className="hdr-dd-item" style={{ animationDelay: '40ms' }}>
              <OctaveDiagram label={t('upperOctaveLabel')} octave={UPPER} />
            </div>
            <div className="hdr-dd-item" style={{ animationDelay: '120ms' }}>
              <OctaveDiagram label={t('lowerOctaveLabel')} octave={LOWER} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OctaveDiagram({ label, octave }: { label: string; octave: OctaveRow }): React.JSX.Element {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        {label}
      </p>
      <div className="relative w-full h-20 select-none rounded-lg p-1.5 bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60">
        <div className="relative w-full h-full">
          <div className="absolute inset-0 flex gap-[2px]">
            {octave.whites.map((letter) => (
              <div
                key={letter}
                className="flex-1 bg-white dark:bg-slate-100 rounded-b-[5px] flex items-end justify-center pb-1.5 shadow-[inset_0_-2px_0_rgba(0,0,0,0.06)] border border-slate-300/70 dark:border-slate-400/40 border-t-0"
              >
                <span className="text-slate-700 text-[11px] font-bold leading-none">{letter}</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 pointer-events-none">
            {octave.blacks.map(({ letter, afterIdx }) => {
              const leftPct = (afterIdx + 1) * 10
              return (
                <div
                  key={letter}
                  className="absolute top-0 h-[62%] w-[6.5%] -translate-x-1/2 bg-gradient-to-b from-slate-800 to-black rounded-b-[4px] flex items-end justify-center pb-1 z-10 shadow-[0_2px_4px_rgba(0,0,0,0.45)] border border-black/40"
                  style={{ left: `${leftPct}%` }}
                >
                  <span className="text-white text-[10px] font-bold leading-none">{letter}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
