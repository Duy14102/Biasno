import React from 'react'

/** Empty / unsupported state for the MIDI device picker.  Rendered when
 *  there are no connectable devices to list. */
export default function DevicePanel({
  state,
}: { state: 'none' | 'unsupported' }): React.JSX.Element {
  const isUnsupported = state === 'unsupported'
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
      <div className={[
        'w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ring-1',
        isUnsupported
          ? 'bg-red-500/10 text-red-300 ring-red-500/30'
          : 'bg-slate-700/80 text-slate-300 ring-slate-600/50',
      ].join(' ')}>
        {isUnsupported ? '⚠' : '🎹'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-200 text-sm">
          {isUnsupported ? 'MIDI không khả dụng' : 'Chưa kết nối đàn'}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
          {isUnsupported
            ? 'Trình duyệt không hỗ trợ Web MIDI API'
            : 'Cắm đàn qua cổng USB rồi thử lại — hoặc dùng phím máy tính bên dưới.'}
        </p>
      </div>
    </div>
  )
}
