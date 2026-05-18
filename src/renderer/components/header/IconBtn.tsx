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
            ? 'bg-slate-100 border border-slate-300 hover:bg-red-500 hover:border-red-500 text-slate-700 hover:text-white dark:bg-slate-700 dark:border-transparent dark:hover:bg-red-600 dark:text-slate-300'
            : 'bg-slate-100 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 text-slate-700 dark:bg-slate-700 dark:border-transparent dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  )
})

export default IconBtn
