import React from 'react'

/** Mini one-octave piano showing the computer-keyboard mapping
 *  (A → ; = C4 → E5).  Sits below the device panel as a permanent
 *  cheat-sheet so players without a MIDI keyboard can find their bearings. */
export default function KeyboardHint(): React.JSX.Element {
  // 10 white keys spanning C4..E5.  Each entry = computer-keyboard letter.
  const whites = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';']
  // Black keys, positioned by the index of the white key they sit AFTER.
  // Gaps after D, B, and final E are absent — the natural piano layout.
  //  whites: A  S  D  F  G  H  J  K  L  ;
  //  notes:  C  D  E  F  G  A  B  C  D  E
  //  black after idx: 0  1     3  4  5     7  8
  const blacks: Array<{ letter: string; afterIdx: number }> = [
    { letter: 'W', afterIdx: 0 },
    { letter: 'E', afterIdx: 1 },
    { letter: 'T', afterIdx: 3 },
    { letter: 'Y', afterIdx: 4 },
    { letter: 'U', afterIdx: 5 },
    { letter: 'O', afterIdx: 7 },
    { letter: 'P', afterIdx: 8 },
  ]
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
          Phím máy tính
        </p>
        <p className="text-[10px] text-slate-500 font-mono">A = C4 · ; = E5</p>
      </div>
      <div className="relative w-full h-16 select-none">
        {/* White keys */}
        <div className="absolute inset-0 flex gap-px">
          {whites.map((letter) => (
            <div
              key={letter}
              className="flex-1 bg-gradient-to-b from-slate-100 to-slate-200 rounded-b-md flex items-end justify-center pb-1 shadow-inner"
            >
              <span className="text-slate-700 text-[10px] font-bold leading-none">{letter}</span>
            </div>
          ))}
        </div>
        {/* Black keys positioned over the boundary between adjacent whites. */}
        <div className="absolute inset-0">
          {blacks.map(({ letter, afterIdx }) => {
            const leftPct = (afterIdx + 1) * 10   // each white = 10 % of row width
            return (
              <div
                key={letter}
                className="absolute top-0 h-3/5 w-[5.5%] -translate-x-1/2 bg-gradient-to-b from-slate-900 to-slate-800 rounded-b-md flex items-end justify-center pb-1 z-10 shadow-md"
                style={{ left: `${leftPct}%` }}
              >
                <span className="text-slate-100 text-[9px] font-bold leading-none">{letter}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
