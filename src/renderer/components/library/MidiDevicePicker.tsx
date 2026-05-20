// Device picker rendered on HomePage. Shows the union of live + remembered
// devices: the connected one becomes a "hero" card, the others stack as
// compact rows below. Offline-but-remembered entries are still listed so the
// user can see what's known and either plug them back in or forget them.

import React from 'react'
import { useMidi, type MidiDeviceView } from '../../context/MidiContext'
import { useLanguage } from '../../i18n/LanguageContext'
import DevicePanel from './DevicePanel'
import { PianoIcon } from '../header/icons'
import { CloseIcon } from './icons'

export default function MidiDevicePicker(): React.JSX.Element {
  const { supported, devices, connectedId, connecting, connectError, connect, forgetDevice } = useMidi()
  const { t } = useLanguage()

  const onlineCount = devices.filter(d => d.online).length

  if (!supported) return <DevicePanel state="unsupported" />
  if (devices.length === 0) return <DevicePanel state="none" />

  const active   = devices.find(d => d.id === connectedId) ?? null
  const inactive = devices.filter(d => d.id !== connectedId)

  return (
    <div className="w-full flex flex-col gap-2.5">
      <div className="flex items-center gap-2 -mb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {t('midiDevicesHeading')}
        </span>
        <div className="flex-1 h-px bg-slate-300/70 dark:bg-slate-700/50" />
        <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {connectedId ? '1' : '0'}/{onlineCount}
        </span>
      </div>

      {active && <ActiveDeviceCard device={active} onClick={() => connect(active.id)} />}

      {inactive.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {active && (
            <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('deviceClickToConnect')}
            </p>
          )}
          {inactive.map(dev => (
            <InactiveDeviceRow
              key={dev.id}
              device={dev}
              connecting={connecting === dev.id}
              errorMessage={connectError?.deviceId === dev.id ? connectError.message : null}
              onClick={() => connect(dev.id)}
              onForget={dev.online ? null : () => forgetDevice(dev.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ActiveDeviceCard({ device, onClick }: { device: MidiDeviceView; onClick: () => void }): React.JSX.Element {
  const { t } = useLanguage()
  return (
    <button
      onClick={onClick}
      className="group relative w-full flex items-center gap-3.5 p-4 pl-5 rounded-2xl border text-left overflow-hidden bg-gradient-to-br from-blue-50 via-white to-violet-50 border-blue-400 shadow-lg shadow-blue-500/15 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/20 dark:from-blue-600/15 dark:via-slate-800/40 dark:to-violet-600/10 dark:border-blue-500/50"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-400 to-violet-500" />
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-md shadow-blue-500/40 ring-2 ring-white/30 dark:ring-white/10">
        <PianoIcon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate text-sm text-blue-900 dark:text-white">{device.name}</p>
        <p className="text-xs mt-0.5 text-blue-700/80 dark:text-blue-300/90 truncate">{t('deviceConnected')}</p>
      </div>
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0 mr-1" aria-hidden>
        <span className="absolute inset-0 inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500 shadow-lg shadow-green-500/60" />
      </span>
    </button>
  )
}

interface InactiveRowProps {
  device:       MidiDeviceView
  connecting:   boolean
  errorMessage: string | null
  onClick:      () => void
  onForget:     (() => void) | null
}

function InactiveDeviceRow({ device, connecting, errorMessage, onClick, onForget }: InactiveRowProps): React.JSX.Element {
  const { t } = useLanguage()
  const offline = !device.online

  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex items-stretch">
        <button
          onClick={onClick}
          disabled={connecting}
          className={[
            'group flex-1 flex items-center gap-2.5 px-3 py-2.5 border text-left transition-colors',
            onForget ? 'rounded-l-lg border-r-0' : 'rounded-lg',
            offline
              ? 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300 dark:bg-slate-800/20 dark:border-slate-700/30 dark:hover:bg-slate-800/50 dark:hover:border-slate-600/60'
              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-blue-300 dark:bg-slate-800/40 dark:border-slate-700/40 dark:hover:bg-slate-800/80 dark:hover:border-blue-500/40',
            connecting ? 'opacity-80 cursor-wait' : '',
          ].join(' ')}
        >
          <div className={[
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
            offline
              ? 'bg-slate-100/70 text-slate-400 dark:bg-slate-700/30 dark:text-slate-500'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-500/10 dark:group-hover:text-blue-300',
          ].join(' ')}>
            <PianoIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={[
              'truncate text-[13px] font-medium',
              offline
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-slate-700 dark:text-slate-300',
            ].join(' ')}>
              {device.name}
            </p>
            {(connecting || offline) && (
              <p className={[
                'text-[10.5px] mt-0.5 truncate',
                connecting ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400 dark:text-slate-500',
              ].join(' ')}>
                {connecting ? t('deviceConnecting') : t('deviceOfflineHint')}
              </p>
            )}
          </div>
          {connecting ? (
            <Spinner />
          ) : offline ? (
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400 flex-shrink-0">
              {t('deviceOffline')}
            </span>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-500 transition-colors" aria-hidden />
          )}
        </button>
        {onForget && !connecting && (
          <button
            onClick={onForget}
            className="flex items-center justify-center px-2.5 rounded-r-lg border border-l-0 bg-slate-50 border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:bg-slate-800/20 dark:border-slate-700/30 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-300 dark:hover:border-red-500/30 transition-colors"
            title={t('forgetDevice')}
            aria-label={t('forgetDevice')}
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {errorMessage && (
        <p className="px-2 text-[11px] text-red-600 dark:text-red-400 leading-snug">
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function Spinner(): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0"
    />
  )
}
