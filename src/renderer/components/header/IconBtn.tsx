import React, { useEffect, useRef, useState } from 'react'

export interface IconBtnProps {
  onClick:  () => void
  title:    string
  active?:  boolean
  danger?:  boolean
  children: React.ReactNode
}

// Icon animations live next to the button so the file stays self-contained.
// `iconHoverLift` — gentle scale + lift on hover (group-hover).
// `iconPress`     — quick squash on mouse-down.
// `iconActivePop` — bounce when `active` flips true (toggle on).
// `dangerShake`   — small horizontal wiggle on hover for the back arrow.
const ICONBTN_CSS = `
@keyframes iconActivePop {
  0%   { transform: scale(0.6) rotate(-12deg); }
  60%  { transform: scale(1.18) rotate(6deg);  }
  100% { transform: scale(1)    rotate(0);     }
}
@keyframes iconWobble {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-2px); }
  75%      { transform: translateX(2px);  }
}
.iconbtn-pop    { animation: iconActivePop 360ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.iconbtn-group:hover .iconbtn-glyph     { transform: scale(1.18); }
.iconbtn-group:active .iconbtn-glyph    { transform: scale(0.88); }
.iconbtn-group.is-danger:hover .iconbtn-glyph { animation: iconWobble 360ms ease-in-out; }
`

/** Square 36 × 36 icon button used throughout the header transport, toggles,
 *  and settings opener.  Three visual variants:
 *   - default: slate background, lightens on hover
 *   - active : blue background + glow shadow
 *   - danger : slate background, turns red on hover (used for Back)
 *  Hover lifts and scales the glyph; pressing squashes it; flipping `active`
 *  true triggers a one-shot bounce so toggles feel tactile. */
const IconBtn = React.memo(function IconBtn({
  onClick, title, active = false, danger = false, children,
}: IconBtnProps) {
  // Re-key the glyph each time `active` flips on so the activation bounce
  // replays. Skip the very first render so non-toggle buttons don't animate
  // unprompted on mount.
  const [popKey, setPopKey] = useState(0)
  const prev   = useRef(active)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; prev.current = active; return }
    if (!prev.current && active) setPopKey(k => k + 1)
    prev.current = active
  }, [active])

  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'iconbtn-group group relative flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold overflow-hidden',
        'transition-[background-color,border-color,box-shadow,transform] duration-150',
        'hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96]',
        active
          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40 hover:shadow-blue-500/55'
          : danger
            ? 'is-danger bg-slate-100 border border-slate-300 hover:bg-red-500 hover:border-red-500 text-slate-700 hover:text-white hover:shadow-md hover:shadow-red-500/30 dark:bg-slate-700 dark:border-transparent dark:hover:bg-red-600 dark:text-slate-300'
            : 'bg-slate-100 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 hover:shadow-md hover:shadow-blue-500/10 text-slate-700 dark:bg-slate-700 dark:border-transparent dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white',
      ].join(' ')}
    >
      <style>{ICONBTN_CSS}</style>
      <span
        key={popKey}
        className={[
          'iconbtn-glyph inline-flex items-center justify-center leading-none',
          'transition-transform duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          popKey > 0 ? 'iconbtn-pop' : '',
        ].join(' ')}
      >
        {children}
      </span>
    </button>
  )
})

export default IconBtn
