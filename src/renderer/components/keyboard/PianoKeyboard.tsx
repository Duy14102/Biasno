import React, { useMemo, useCallback } from 'react'
import {
  isBlackKey, getWhiteKeyIndex, getBlackKeyLeftWhite,
  PIANO_RANGES, type KeyCount,
} from '@/utils'
import type { Hand } from '@/types'

const WHITE_NOTE_NAMES = ['C','','D','','E','F','','G','','A','','B']

// Keyframes for the per-onset flash overlay.  Each time a key receives a new
// note onset, a fresh overlay element mounts (keyed by the note's start time)
// and runs this animation from 0 → peak → 0, giving the visual a "tap" on
// every press — including rapid repeats of the same MIDI number where the
// underlying background colour wouldn't otherwise change.
//
// Shape: 0 % → 20 % builds up to peak (≈ 36 ms of the 180 ms animation),
// then 20 % → 100 % decays.  In view-listen mode the parent component sets
// the key active ~30 ms before the audio onset (FLASH_ANTICIPATE_S in
// practice/constants), so the peak frame coincides with the moment the
// falling note touches the keyboard — no perceived "delay".
const KB_FLASH_CSS = `
@keyframes kb-flash-white {
  0%   { opacity: 0;    }
  20%  { opacity: 0.7;  }
  100% { opacity: 0;    }
}
@keyframes kb-flash-black {
  0%   { opacity: 0;    }
  20%  { opacity: 0.6;  }
  100% { opacity: 0;    }
}
.kb-flash-white { animation: kb-flash-white 180ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
.kb-flash-black { animation: kb-flash-black 180ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }

/* Idle hint: amber pulse on keys the player should press next.  Distinct
   amber/gold tone keeps it readable against both hand colours and the
   green/red hit feedback. */
@keyframes kb-hint-pulse {
  0%, 100% { opacity: 0.30; transform: scale(1);    }
  50%      { opacity: 0.85; transform: scale(1.02); }
}
.kb-hint-white {
  animation: kb-hint-pulse 1.1s ease-in-out infinite;
  background: linear-gradient(to bottom, rgba(250,204,21,0.35) 0%, rgba(245,158,11,0.85) 100%);
  box-shadow: 0 0 14px 3px rgba(250,204,21,0.55), inset 0 0 0 2px rgba(245,158,11,0.85);
  transform-origin: bottom center;
}
.kb-hint-black {
  animation: kb-hint-pulse 1.1s ease-in-out infinite;
  background: linear-gradient(to bottom, rgba(250,204,21,0.55) 0%, rgba(245,158,11,0.95) 100%);
  box-shadow: 0 0 12px 2px rgba(250,204,21,0.6), inset 0 0 0 1.5px rgba(245,158,11,0.9);
  transform-origin: bottom center;
}
`

interface KeyHighlight {
  hand:      Hand
  hitState?: 'correct' | 'wrong'
  // Onset timestamp (seconds in song time, view-listen mode) — used purely
  // as a React `key` for the flash overlay so it remounts and re-runs the
  // animation on every distinct onset, even when MIDI number stays the same.
  time?:     number
}

interface PianoKeyboardProps {
  activeKeys: Map<number, KeyHighlight>
  // MIDI numbers to pulse-highlight as a "press this next" hint.  Hint never
  // wins over an actual press: keys present in activeKeys suppress the hint.
  hintKeys?:  Set<number>
  onKeyDown?: (midi: number) => void
  onKeyUp?: (midi: number) => void
  height?: number
  keyCount?: KeyCount  // 88 (default) | 76 | 61
}

const COLORS = {
  rightHit:   '#4488ff',
  leftHit:    '#ff8833',
  unknownHit: '#88aacc',
  correct:    '#44ee88',
  wrong:      '#ff4455'
}

function getKeyColor(midi: number, highlight: KeyHighlight | undefined): string {
  if (!highlight) return isBlackKey(midi) ? '#1a1614' : '#f5f0eb'
  if (highlight.hitState === 'correct') return COLORS.correct
  if (highlight.hitState === 'wrong')   return COLORS.wrong
  if (highlight.hand === 'right')  return COLORS.rightHit
  if (highlight.hand === 'left')   return COLORS.leftHit
  return COLORS.unknownHit
}

export default function PianoKeyboard({
  activeKeys, hintKeys, onKeyDown, onKeyUp, height = 200, keyCount = 88,
}: PianoKeyboardProps): React.JSX.Element {
  const range = PIANO_RANGES[keyCount]

  const { whiteKeys, blackKeys } = useMemo(() => {
    const whites: number[] = [], blacks: number[] = []
    for (let m = range.min; m <= range.max; m++) {
      if (isBlackKey(m)) blacks.push(m); else whites.push(m)
    }
    return { whiteKeys: whites, blackKeys: blacks }
  }, [range.min, range.max])

  const wPct  = 100 / range.totalWhite
  const bwPct = wPct * 0.63
  const bh    = height * 0.63

  const onMouseDown = useCallback((midi: number) => { onKeyDown?.(midi) }, [onKeyDown])
  const onMouseUp   = useCallback((midi: number) => { onKeyUp?.(midi)   }, [onKeyUp])

  return (
    <div
      style={{ position: 'relative', width: '100%', height, flexShrink: 0, userSelect: 'none' }}
      className="bg-zinc-900"
    >
      <style>{KB_FLASH_CSS}</style>

      {/* White keys */}
      {whiteKeys.map((midi) => {
        const idx      = getWhiteKeyIndex(midi) - range.whiteOffset
        const left     = idx * wPct
        const hl       = activeKeys.get(midi)
        const color    = getKeyColor(midi, hl)
        const isActive = !!hl
        const isHint   = !isActive && !!hintKeys?.has(midi)
        const noteName = WHITE_NOTE_NAMES[midi % 12]

        return (
          <div
            key={midi}
            onMouseDown={() => onMouseDown(midi)}
            onMouseUp={() => onMouseUp(midi)}
            onMouseLeave={(e) => { if (e.buttons === 1) onMouseUp(midi) }}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: 0,
              width: `calc(${wPct}% - 1px)`,
              height: '100%',
              background: isActive
                ? `linear-gradient(to bottom, ${color}ee, ${color})`
                : 'linear-gradient(to bottom, #f5f0eb 0%, #e8e0d8 70%, #d4c8bc 100%)',
              border: '1px solid #6b6460',
              borderTop: 'none',
              borderRadius: '0 0 5px 5px',
              boxSizing: 'border-box',
              cursor: 'pointer',
              zIndex: 1,
              transition: 'background 0.04s',
              boxShadow: isActive
                ? `0 0 12px 3px ${color}88, inset 0 -3px 0 rgba(0,0,0,0.2)`
                : 'inset 0 -5px 0 rgba(0,0,0,0.12), 1px 0 0 rgba(0,0,0,0.05)'
            }}
          >
            {/* Per-onset flash: white overlay that fades out in 150 ms.
                Keyed by hl.time so a new onset (same MIDI, new time) forces
                React to remount the element, restarting the animation.  This
                is what gives rapid repeated notes a visible "tap" rhythm
                instead of looking like one continuous press. */}
            {isActive && (
              <span
                key={hl?.time ?? 'p'}
                className="kb-flash-white"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#ffffff',
                  borderRadius: '0 0 5px 5px',
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              />
            )}

            {/* Idle-hint pulse: amber overlay that loops until any key is pressed. */}
            {isHint && (
              <span
                className="kb-hint-white"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '0 0 5px 5px',
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              />
            )}

            {/* Note name label at bottom of each white key */}
            {noteName && (
              <span style={{
                position: 'absolute',
                bottom: 5,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: 9,
                fontFamily: 'monospace',
                fontWeight: 600,
                color: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.28)',
                pointerEvents: 'none',
                zIndex: 4,
                letterSpacing: 0
              }}>
                {noteName}
              </span>
            )}
          </div>
        )
      })}

      {/* Octave number label (small, below note name) for C keys */}
      {whiteKeys.filter((m) => m % 12 === 0).map((midi) => {
        const idx  = getWhiteKeyIndex(midi) - range.whiteOffset
        const left = idx * wPct
        return (
          <div
            key={`oct-${midi}`}
            style={{
              position: 'absolute',
              left: `calc(${left}% + ${wPct * 0.25}%)`,
              bottom: 16,
              fontSize: 7,
              color: 'rgba(0,0,0,0.18)',
              zIndex: 3,
              pointerEvents: 'none',
              fontFamily: 'monospace'
            }}
          >
            {Math.floor(midi / 12) - 1}
          </div>
        )
      })}

      {/* Black keys */}
      {blackKeys.map((midi) => {
        const frac     = (getBlackKeyLeftWhite(midi) - range.whiteOffset + 0.70) / range.totalWhite
        const left     = frac * 100
        const hl       = activeKeys.get(midi)
        const color    = getKeyColor(midi, hl)
        const isActive = !!hl
        const isHint   = !isActive && !!hintKeys?.has(midi)

        return (
          <div
            key={midi}
            onMouseDown={() => onMouseDown(midi)}
            onMouseUp={() => onMouseUp(midi)}
            onMouseLeave={(e) => { if (e.buttons === 1) onMouseUp(midi) }}
            style={{
              position: 'absolute',
              left: `calc(${left}% - ${bwPct / 2}%)`,
              top: 0,
              width: `${bwPct}%`,
              height: bh,
              background: isActive
                ? `linear-gradient(to bottom, ${color}, ${color}bb)`
                : 'linear-gradient(to bottom, #2a2420 0%, #1a1614 40%, #0f0c0a 100%)',
              borderRadius: '0 0 4px 4px',
              cursor: 'pointer',
              zIndex: 2,
              transition: 'background 0.04s',
              boxShadow: isActive
                ? `0 0 8px 2px ${color}66`
                : '2px 5px 10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)'
            }}
          >
            {/* Per-onset flash overlay — same trick as the white keys. */}
            {isActive && (
              <span
                key={hl?.time ?? 'p'}
                className="kb-flash-black"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#ffffff',
                  borderRadius: '0 0 4px 4px',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Idle-hint pulse on black keys. */}
            {isHint && (
              <span
                className="kb-hint-black"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '0 0 4px 4px',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
