import React from 'react'
import { useLanguage } from '@/i18n'
import { PianoIcon } from '@/components/header'
import { WarningIcon } from './icons'

/** Empty / unsupported state for the MIDI device picker.  Rendered when
 *  there are no connectable devices to list. */
export default function DevicePanel({
  state,
}: { state: 'none' | 'unsupported' }): React.JSX.Element {
  const { t } = useLanguage()
  const isUnsupported = state === 'unsupported'
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-300 shadow-sm dark:bg-slate-800/60 dark:border-slate-700/60 dark:shadow-none">
      <div className={[
        'w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ring-1',
        isUnsupported
          ? 'bg-red-100 text-red-600 ring-red-300 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30'
          : 'bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-700/80 dark:text-slate-300 dark:ring-slate-600/50',
      ].join(' ')}>
        {isUnsupported ? <WarningIcon className="w-6 h-6" /> : <PianoIcon className="w-6 h-6" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
          {isUnsupported ? t('midiUnavailable') : t('noDeviceConnected')}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {isUnsupported ? t('noWebMidiSupport') : t('connectUsbInstruction')}
        </p>
      </div>
    </div>
  )
}
