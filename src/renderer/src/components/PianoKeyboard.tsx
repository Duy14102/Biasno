import React, { useMemo, useCallback } from 'react'
import {
  PIANO_MIN, PIANO_MAX, TOTAL_WHITE_KEYS,
  isBlackKey, getWhiteKeyIndex, getBlackKeyFraction
} from '../utils/noteUtils'
import type { Hand } from '../types'

const WHITE_NOTE_NAMES = ['C','','D','','E','F','','G','','A','','B']

interface KeyHighlight {
  hand: Hand
  hitState?: 'correct' | 'wrong'
}

interface PianoKeyboardProps {
  activeKeys: Map<number, KeyHighlight>
  onKeyDown?: (midi: number) => void
  onKeyUp?: (midi: number) => void
  height?: number
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
  activeKeys, onKeyDown, onKeyUp, height = 200
}: PianoKeyboardProps): React.JSX.Element {
  const { whiteKeys, blackKeys } = useMemo(() => {
    const whites: number[] = [], blacks: number[] = []
    for (let m = PIANO_MIN; m <= PIANO_MAX; m++) {
      isBlackKey(m) ? blacks.push(m) : whites.push(m)
    }
    return { whiteKeys: whites, blackKeys: blacks }
  }, [])

  const wPct  = 100 / TOTAL_WHITE_KEYS
  const bwPct = wPct * 0.63
  const bh    = height * 0.63

  const onMouseDown = useCallback((midi: number) => { onKeyDown?.(midi) }, [onKeyDown])
  const onMouseUp   = useCallback((midi: number) => { onKeyUp?.(midi)   }, [onKeyUp])

  return (
    <div
      style={{ position: 'relative', width: '100%', height, flexShrink: 0, userSelect: 'none' }}
      className="bg-zinc-900"
    >
      {/* White keys */}
      {whiteKeys.map((midi) => {
        const idx      = getWhiteKeyIndex(midi)
        const left     = idx * wPct
        const hl       = activeKeys.get(midi)
        const color    = getKeyColor(midi, hl)
        const isActive = !!hl
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
        const idx  = getWhiteKeyIndex(midi)
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
        const frac     = getBlackKeyFraction(midi)
        const left     = frac * 100
        const hl       = activeKeys.get(midi)
        const color    = getKeyColor(midi, hl)
        const isActive = !!hl

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
          />
        )
      })}
    </div>
  )
}
