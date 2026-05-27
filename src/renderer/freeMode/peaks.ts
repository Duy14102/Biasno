import type { Clip, RecordedNote } from './types'
import { chunkEndAt } from './clipOps'

// Render the recorded MIDI to a REAL AudioBuffer via the Web Audio API's
// OfflineAudioContext.  Skipping Tone.Offline here on purpose — fewer
// layers between the data and the buffer means fewer places for a missed
// render to hide.  Per note we spin up an oscillator + gain envelope and
// schedule them on the offline timeline; `startRendering()` then produces
// the buffer.  Wavesurfer downsamples this buffer to peaks for the canvas.
//
// Single source of truth for what a clip's audio actually IS:
//   • Each note's audible window = [note.startMs, min(note.endMs, owning
//     clip's endMs)] — endMs is clamped so a sustained tail never leaks
//     past the clip the user drew around it.  Fixes the "audio kế bên
//     mất / còn sót / overlap" family of bugs at root.
//   • Notes whose onset is outside every clip are dropped — orphan notes
//     can exist transiently mid-operation but never make it into audio.

const SAMPLE_RATE = 22_050     // half of 44.1 kHz — visual fidelity, smaller buffer
const ATTACK_SEC  = 0.008
const DECAY_SEC   = 0.18
const SUSTAIN_LVL = 0.32
const RELEASE_SEC = 0.10

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

interface Window {
  midi:     number
  velocity: number
  gain:     number
  startSec: number
  durSec:   number
  // When the note was re-anchored by deleteAt — start at sustain level
  // instead of attacking from 0.
  continues: boolean
}

// At a touching boundary between two clips (a prior split), a note whose
// onset is exactly at the cut would otherwise be assigned to the LEFT clip
// (Array.find iterates in array order) and its audible window clamped to
// zero — the note disappears.  Iterate in reverse so the RIGHT clip wins
// at boundaries; the audible window is then [onset, ownerEnd] with real
// duration.
function findOwningClip(clips: Clip[], ms: number): Clip | undefined {
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i]
    if (ms >= c.startMs && ms <= c.endMs) return c
  }
  return undefined
}

function buildWindows(notes: RecordedNote[], clips: Clip[]): Window[] {
  const out: Window[] = []
  for (const n of notes) {
    const owning = findOwningClip(clips, n.startMs)
    if (!owning) continue
    // Audible end extends through every touching clip past the onset clip —
    // so a sustained note crossing a split (clips touch) plays in full,
    // identical to the pre-split state.  Only gaps (created by delete)
    // truncate the audible window.
    const chunkEnd = chunkEndAt(clips, n.startMs) ?? owning.endMs
    const endMs = Math.min(n.endMs, chunkEnd)
    const durMs = endMs - n.startMs
    if (durMs <= 0) continue
    out.push({
      midi:      n.midi,
      velocity:  n.velocity,
      gain:      owning.volume,
      startSec:  n.startMs / 1000,
      durSec:    durMs / 1000,
      continues: !!n.continues,
    })
  }
  return out
}

export async function renderNotesToBuffer(
  notes: RecordedNote[],
  clips: Clip[],
  durationMs: number,
): Promise<AudioBuffer | null> {
  if (durationMs <= 0 || notes.length === 0 || clips.length === 0) return null
  const windows = buildWindows(notes, clips)
  if (windows.length === 0) return null

  const durationSec = Math.max(0.1, durationMs / 1000 + RELEASE_SEC)
  const ctx = new OfflineAudioContext({
    numberOfChannels: 1,
    length:           Math.ceil(durationSec * SAMPLE_RATE),
    sampleRate:       SAMPLE_RATE,
  })

  // Global compressor so chord notes don't clip after summing voices.
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -10
  compressor.knee.value      = 6
  compressor.ratio.value     = 4
  compressor.attack.value    = 0.003
  compressor.release.value   = 0.1
  compressor.connect(ctx.destination)

  for (const w of windows) {
    const osc  = ctx.createOscillator()
    const env  = ctx.createGain()
    osc.type   = 'triangle'
    osc.frequency.value = midiToHz(w.midi)
    osc.connect(env).connect(compressor)

    const t0   = w.startSec
    const peak = Math.max(0, Math.min(1, w.velocity * w.gain))
    if (peak <= 0) continue
    const sustainLvl = peak * SUSTAIN_LVL

    // Natural ADSR unless the note was re-anchored by deleteAt — those
    // pick up at sustain level (no attack ramp from 0).  splitAt never
    // sets this flag, so the wave shape is preserved across every split.
    if (w.continues) {
      env.gain.setValueAtTime(sustainLvl, t0)
    } else {
      env.gain.setValueAtTime(0, t0)
      env.gain.linearRampToValueAtTime(peak,       t0 + ATTACK_SEC)
      env.gain.linearRampToValueAtTime(sustainLvl, t0 + ATTACK_SEC + DECAY_SEC)
    }
    const releaseStart = t0 + w.durSec
    env.gain.setValueAtTime(sustainLvl, releaseStart)
    env.gain.linearRampToValueAtTime(0, releaseStart + RELEASE_SEC)

    osc.start(t0)
    osc.stop(releaseStart + RELEASE_SEC)
  }

  return ctx.startRendering()
}

// Downsample one channel of the rendered buffer to `peaksPerSec` values
// per second.  Wavesurfer downsamples anyway based on its canvas width,
// but pre-decimating to a manageable size keeps `setOptions` cheap.
// Decimation takes abs-max per bucket so transient peaks survive.
export function bufferToPeaks(buf: AudioBuffer, peaksPerSec = 200): Float32Array {
  const totalPeaks = Math.max(1, Math.ceil(buf.duration * peaksPerSec))
  const samplesPerPeak = Math.max(1, Math.floor(buf.length / totalPeaks))
  const data = buf.getChannelData(0)
  const out  = new Float32Array(totalPeaks)
  for (let i = 0; i < totalPeaks; i++) {
    const start = i * samplesPerPeak
    const end   = Math.min(data.length, start + samplesPerPeak)
    let max = 0
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j])
      if (v > max) max = v
    }
    out[i] = max
  }
  return out
}

// Sized so wavesurfer renders a flat line for an empty / pre-render
// snapshot.  Avoids "no peaks" surprises in the UI.
export function emptyPeaks(durationMs: number, peaksPerSec = 200): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(durationMs / 1000 * peaksPerSec)))
}
