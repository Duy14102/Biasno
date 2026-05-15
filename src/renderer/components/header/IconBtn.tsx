import React from 'react'

interface IconBtnProps {
  onClick:  () => void
  title:    string
  active?:  boolean
  danger?:  boolean
  children: React.ReactNode
}

/** Square 36 × 36 icon button used throughout the header transport, toggles,
 *  and settings opener.  Three visual variants:
 *   - default: slate background, lightens on hover
 *   - active : blue background + glow shadow
 *   - danger : slate background, turns red on hover (used for Back) */
const IconBtn = React.memo(function IconBtn({
  onClick, title, active = false, danger = false, children,
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
            : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  )
})

export default IconBtn
