import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RecordedNote } from '../../freeMode/types'

// Waveform-based trim slider — SoundCloud-style bar visualization with
// Clipchamp-style "window-closing" trim handles.  Bins are derived from the
// recorded notes' velocity × overlap-with-bin, so loud / chord-heavy moments
// stand out.  In-range bars are vibrant; bars outside the trim window are
// dimmed grey to make the selection obvious at a glance.

interface Props {
  min:          number
  max:          number
  startMs:      number
  endMs:        number
  notes:        RecordedNote[]
  onDraftStart: (ms: number) => void
  onDraftEnd:   (ms: number) => void
  onCommitStart: (ms: number) => void
  onCommitEnd:   (ms: number) => void
  formatMs:     (ms: number) => string
  minGap?:      number
  // Live playback cursor.  Shown whenever it sits inside the trim region;
  // sweeps across during play, sits still otherwise.
  playbackMs?:     number
  playbackActive?: boolean
  // Fires when the user clicks somewhere on the waveform.  Parent should
  // (a) move the playhead to this position and (b) treat it as the next
  // play-from point — exactly like dragging the cursor in a video editor.
  onSeek?:         (ms: number) => void
}

// Distance (ms) within which a dragging handle "magnetises" to the marker.
// Roughly equivalent to a video editor's snap-to-marker threshold.
const MARKER_SNAP_MS = 120

const BIN_COUNT = 128

// Bin → simulated audio amplitude.
//
// Naive "sum velocities of overlapping notes" gives every active bin roughly
// the same height because piano velocities cluster near 0.8 — the trim then
// looks like a step chart, not a SoundCloud-style waveform.
//
// Real audio waveforms have natural variation because the signal itself
// rises (attack), falls (decay), holds (sustain), and tails off (release).
// We approximate that ADSR envelope per note and stack them; the result has
// tall spikes at note onsets, mid heights during sustain, and small tails at
// release — closer to what a sampled-audio binner would draw.
function computeBins(notes: RecordedNote[], durationMs: number): number[] {
  const bins = new Array<number>(BIN_COUNT).fill(0)
  if (durationMs <= 0 || notes.length === 0) return bins
  const binW = durationMs / BIN_COUNT

  // Piano-ish ADSR.  Sharp attack so onsets read as peaks; quick decay so
  // sustain doesn't drag the whole region to one height.
  const ATTACK_MS  = 8
  const DECAY_MS   = 220
  const SUSTAIN    = 0.32
  const RELEASE_MS = 90

  for (const n of notes) {
    const onset = n.startMs
    const dur   = Math.max(1, n.endMs - n.startMs)
    const startBin = Math.max(0, Math.floor(onset / binW))
    // Tiny tail past noteEnd so very-short notes still reach at least one bin.
    const endBin   = Math.min(BIN_COUNT, Math.ceil((n.endMs + 40) / binW))

    for (let i = startBin; i < endBin; i++) {
      const binCenter = (i + 0.5) * binW
      const t = binCenter - onset
      if (t < 0) continue

      let env: number
      if (t < ATTACK_MS) {
        env = t / ATTACK_MS                              // attack ramp
      } else if (t < ATTACK_MS + DECAY_MS) {
        const k = (t - ATTACK_MS) / DECAY_MS
        env = 1 - (1 - SUSTAIN) * k                       // decay 1 → SUSTAIN
      } else if (t < dur - RELEASE_MS) {
        env = SUSTAIN                                     // sustain plateau
      } else if (t < dur) {
        env = SUSTAIN * Math.max(0, (dur - t) / RELEASE_MS) // release tail
      } else {
        env = 0
      }
      bins[i] += n.velocity * env
    }
  }

  // Per-bin deterministic micro-variation — keeps sustained sections from
  // looking like a flat plateau, the way an actual audio waveform never sits
  // perfectly still.  Three octaves of sine give an organic-but-stable shape.
  for (let i = 0; i < BIN_COUNT; i++) {
    const v = 0.85
          + 0.10 * Math.sin(i * 2.7)
          + 0.07 * Math.sin(i * 5.1 + 1.3)
          + 0.05 * Math.sin(i * 11.7 + 2.7)
    bins[i] *= v
  }

  // Compress dynamic range so the lone tallest peak doesn't flatten the
  // rest of the chart visually.  ^0.55 is approximately SoundCloud's
  // perceived distribution — mid amplitudes stay readable.
  const peak = Math.max(...bins, 0.0001)
  return bins.map((b) => Math.pow(Math.max(0, b) / peak, 0.55))
}

type Active = 'start' | 'end' | null

export default function TrimRange({
  min, max, startMs, endMs, notes,
  onDraftStart, onDraftEnd, onCommitStart, onCommitEnd,
  formatMs, minGap = 50,
  playbackMs, playbackActive, onSeek,
}: Props): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Active>(null)
  const activeRef = useRef<Active>(null)
  useEffect(() => { activeRef.current = active }, [active])

  // The playhead doubles as the snap reference — there is no separate
  // marker.  Clicking the track moves the playhead via onSeek, and a
  // dragging trim handle that gets within MARKER_SNAP_MS of the playhead
  // magnetises to it.
  const playbackMsRef = useRef<number | undefined>(playbackMs)
  useEffect(() => { playbackMsRef.current = playbackMs }, [playbackMs])

  const bins = useMemo(() => computeBins(notes, max - min), [notes, min, max])

  const range = Math.max(1, max - min)
  const startPct = ((startMs - min) / range) * 100
  const endPct   = ((endMs   - min) / range) * 100
  const playPct  = playbackMs !== undefined ? ((playbackMs - min) / range) * 100 : 0
  // The playhead is visible whenever it has a meaningful position inside
  // the trim window — that way it doubles as a static seek cursor when not
  // actively playing, which is the behaviour the user expects after clicking
  // somewhere on the waveform.
  const playVisible =
    playbackMs !== undefined &&
    playbackMs >= startMs &&
    playbackMs <= endMs

  const msAtClientX = useCallback((clientX: number): number => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return min
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return Math.round(min + ratio * range)
  }, [min, range])

  // Snap to playhead if a drag value lands within MARKER_SNAP_MS.  Returns
  // both the resulting ms and whether snapping fired, so the handle can
  // signal the snap visually.
  const snapToPlayhead = useCallback((ms: number): { ms: number; snapped: boolean } => {
    const p = playbackMsRef.current
    if (p === undefined) return { ms, snapped: false }
    if (Math.abs(ms - p) < MARKER_SNAP_MS) return { ms: p, snapped: true }
    return { ms, snapped: false }
  }, [])

  const [snappedSide, setSnappedSide] = useState<Active>(null)

  const onMove = useCallback((e: MouseEvent) => {
    const which = activeRef.current
    if (!which) return
    const raw = msAtClientX(e.clientX)
    const { ms, snapped } = snapToPlayhead(raw)
    setSnappedSide(snapped ? which : null)
    if (which === 'start') onDraftStart(Math.min(ms, endMs - minGap))
    else                   onDraftEnd  (Math.max(ms, startMs + minGap))
  }, [msAtClientX, snapToPlayhead, onDraftStart, onDraftEnd, startMs, endMs, minGap])

  const onUp = useCallback((e: MouseEvent) => {
    const which = activeRef.current
    if (!which) return
    const raw = msAtClientX(e.clientX)
    const { ms } = snapToPlayhead(raw)
    if (which === 'start') onCommitStart(Math.min(ms, endMs - minGap))
    else                   onCommitEnd  (Math.max(ms, startMs + minGap))
    activeRef.current = null
    setActive(null)
    setSnappedSide(null)
  }, [msAtClientX, snapToPlayhead, onCommitStart, onCommitEnd, startMs, endMs, minGap])

  useEffect(() => {
    if (!active) return
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [active, onMove, onUp])

  const beginDrag = (which: Active) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    activeRef.current = which
    setActive(which)
  }

  // Click on the bare track moves the playhead there (and that position is
  // also the snap reference for any subsequent handle drag).  Same gesture
  // as clicking a video editor's timeline.
  const onTrackMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const ms = msAtClientX(e.clientX)
    onSeek?.(ms)
  }, [msAtClientX, onSeek])

  return (
    <div className="flex flex-col gap-2 select-none">
      {/* Time labels — float above the handles so the numbers sit right
          over the position they refer to.  Centered text via translate. */}
      <div className="relative h-4 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
        <span
          className="absolute -translate-x-1/2 px-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold"
          style={{ left: `${startPct}%` }}
        >
          {formatMs(startMs)}
        </span>
        <span
          className="absolute -translate-x-1/2 px-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold"
          style={{ left: `${endPct}%` }}
        >
          {formatMs(endMs)}
        </span>
      </div>

      {/* Waveform track + selection window + handles */}
      <div
        ref={trackRef}
        onMouseDown={onTrackMouseDown}
        className="relative h-20 rounded-lg bg-slate-100 dark:bg-slate-900/70 overflow-hidden border border-slate-200 dark:border-slate-800 cursor-crosshair"
      >
        {/* Bars layer — full row, centered vertically */}
        <div className="absolute inset-0 flex items-center gap-px px-1">
          {bins.map((amp, i) => {
            const binMs = min + ((i + 0.5) / BIN_COUNT) * range
            const inRange = binMs >= startMs && binMs <= endMs
            const height = `${Math.max(8, amp * 92)}%`
            return (
              <span
                key={i}
                className={[
                  'flex-1 rounded-[1.5px] transition-colors',
                  inRange
                    ? 'bg-gradient-to-t from-blue-600 via-violet-500 to-fuchsia-400'
                    : 'bg-slate-300 dark:bg-slate-700',
                ].join(' ')}
                style={{ height, minHeight: 2, opacity: inRange ? 1 : 0.5 }}
              />
            )
          })}
        </div>

        {/* Dim overlay for the OUT-of-range areas — softens those bars further
            without affecting the in-range region. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 bg-slate-50/55 dark:bg-slate-950/55 pointer-events-none"
          style={{ width: `${startPct}%` }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 bg-slate-50/55 dark:bg-slate-950/55 pointer-events-none"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Selection window frame — top + bottom edges in blue, no left/right
            (those are owned by the handles).  Drawn over the bars layer. */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left:   `${startPct}%`,
            right:  `${100 - endPct}%`,
            top:    0,
            bottom: 0,
            borderTop:    '2px solid rgb(59 130 246 / 0.85)',
            borderBottom: '2px solid rgb(59 130 246 / 0.85)',
          }}
        />

        {/* Playback head — always rendered while the cursor sits in the
            trim window.  Sweeps during play, sits still otherwise.  The
            head's resting position is the seek anchor for the next Play.
            A faint pulse animation distinguishes "playing" from "parked". */}
        {playVisible && (
          <div
            aria-hidden
            className={[
              'absolute top-0 bottom-0 w-0.5 -ml-px pointer-events-none z-[18] transition-colors',
              playbackActive ? 'bg-white' : 'bg-white/85',
            ].join(' ')}
            style={{
              left: `${playPct}%`,
              boxShadow: playbackActive
                ? '0 0 8px rgba(255,255,255,0.85), 0 0 14px rgba(96,165,250,0.5)'
                : '0 0 4px rgba(255,255,255,0.4)',
            }}
          >
            <div className={[
              'absolute -top-1 -left-[5px] w-3 h-3 rounded-full bg-white shadow',
              playbackActive ? 'ring-2 ring-blue-300/60' : '',
            ].join(' ')} />
          </div>
        )}

        {/* Left handle — Clipchamp window-closing style */}
        <Handle side="left"  pct={startPct} onMouseDown={beginDrag('start')} dragging={active === 'start'} snapping={snappedSide === 'start'} />
        {/* Right handle */}
        <Handle side="right" pct={endPct}   onMouseDown={beginDrag('end')}   dragging={active === 'end'}   snapping={snappedSide === 'end'} />
      </div>

    </div>
  )
}

// ── Handle ─────────────────────────────────────────────────────────────────
function Handle({
  side, pct, onMouseDown, dragging, snapping,
}: {
  side: 'left' | 'right'; pct: number; onMouseDown: (e: React.MouseEvent) => void; dragging: boolean; snapping: boolean
}) {
  // 12-px wide grab area centered on the trim boundary; the visible bar
  // (10 px) and grip lines sit inside.  Slight horizontal offset so the bar
  // visually closes the selection window (Clipchamp pattern).
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute top-0 bottom-0 w-3.5 -ml-1.5 cursor-ew-resize z-20 flex items-center justify-center group"
      style={{ left: `${pct}%`, touchAction: 'none' }}
      aria-label={side === 'left' ? 'Trim start' : 'Trim end'}
      role="slider"
    >
      <div
        className={[
          'h-full w-2.5 rounded-sm flex flex-col items-center justify-center gap-1',
          'shadow-md transition-all',
          snapping
            ? 'bg-amber-400 shadow-amber-500/70 scale-y-[1.08]'   // signals "locked to marker"
            : dragging
              ? 'bg-blue-400 shadow-blue-500/60 scale-y-[1.04]'
              : 'bg-blue-500 group-hover:bg-blue-400 group-hover:shadow-blue-500/40',
        ].join(' ')}
      >
        {/* Grip — three short horizontal pips, like the resize handle on a
            window edge.  Stay white for contrast against the blue bar. */}
        <span className="w-1 h-px bg-white/90 rounded-full" />
        <span className="w-1 h-px bg-white/90 rounded-full" />
        <span className="w-1 h-px bg-white/90 rounded-full" />
      </div>
    </div>
  )
}
