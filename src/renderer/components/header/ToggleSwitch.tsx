import React from 'react'

/** iOS-style pill switch (40 × 20).  The white thumb slides via translateX
 *  on its own span, never the label or surrounding text, so it doesn't
 *  cause any text re-rasterisation. */
export default function ToggleSwitch({
  on, onClick,
}: { on: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{ padding: '2px' }}
      className={[
        'flex items-center w-10 h-5 rounded-full transition-colors shrink-0',
        on ? 'bg-blue-500' : 'bg-slate-600 hover:bg-slate-500',
      ].join(' ')}
      role="switch"
      aria-checked={on}
    >
      <span
        className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0px)' }}
      />
    </button>
  )
}
