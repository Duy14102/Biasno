import * as Tone from 'tone'
import { instrument as loadInstrument } from 'soundfont-player'

const MIDI_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
function midiToNote(midi: number): string {
  return MIDI_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
}

export type AudioSource = 'MusyngKite' | 'FluidR3' | 'synth'

export class AudioEngine {
  private ac: AudioContext | null = null
  private gainNode: GainNode   | null = null
  private player: Awaited<ReturnType<typeof loadInstrument>> | null = null
  private fallbackSynth: Tone.PolySynth | null = null

  private source: AudioSource = 'synth'
  private isReady    = false
  private _initProm: Promise<AudioSource> | null = null
  private _volume    = 0.85
  private activeNodes    = new Map<number, AudioBufferSourceNode>()
  // Map node → scheduled start time (AudioContext time), so we can selectively
  // stop only future (not-yet-started) nodes without interrupting playing ones
  private scheduledNodes = new Map<AudioBufferSourceNode, number>()
  // Cache AudioBuffers so we can resume mid-note without re-attack
  private bufferCache    = new Map<number, AudioBuffer>()

  // ─── Init (idempotent) ────────────────────────────────────────────────────
  initialize(): Promise<AudioSource> {
    if (this.isReady) return Promise.resolve(this.source)
    if (!this._initProm) this._initProm = this._doInit()
    return this._initProm
  }

  private async _doInit(): Promise<AudioSource> {
    await Tone.start()

    // Use Tone's AudioContext so Tone.now() == ac.currentTime
    this.ac = Tone.getContext().rawContext as AudioContext

    // Gain → destination (always connected — guaranteed audio path)
    this.gainNode = this.ac.createGain()
    this.gainNode.gain.value = this._volume
    this.gainNode.connect(this.ac.destination)

    if (await this._tryLoad('MusyngKite')) return this.source
    if (await this._tryLoad('FluidR3_GM'))  return this.source

    this._createSynth()
    return this.source
  }

  private async _tryLoad(sf: string): Promise<boolean> {
    try {
      this.player = await Promise.race<Awaited<ReturnType<typeof loadInstrument>>>([
        loadInstrument(this.ac!, 'acoustic_grand_piano', {
          soundfont: sf,
          destination: this.gainNode!,
          gain: 5,
          format: 'mp3'
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 18_000))
      ])
      this.source  = sf === 'MusyngKite' ? 'MusyngKite' : 'FluidR3'
      this.isReady = true
      console.log(`[Audio] ${sf} loaded`)
      return true
    } catch (e) {
      console.warn(`[Audio] ${sf} failed:`, e)
      this.player = null
      return false
    }
  }

  private _createSynth(): void {
    this.fallbackSynth = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 32,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.003, decay: 2.0, sustain: 0.0, release: 2.0 },
        volume: -4,
      },
    }).toDestination()
    this.source  = 'synth'
    this.isReady = true
    console.log('[Audio] PolySynth fallback')
  }

  // ─── Public state ─────────────────────────────────────────────────────────
  get ready()            { return this.isReady }
  get audioSource()      { return this.source  }
  get audioSourceLabel() {
    if (this.source === 'MusyngKite') return '🎹 MusyngKite (HQ)'
    if (this.source === 'FluidR3')   return '🎹 FluidR3 GM'
    return '🔊 Synth'
  }
  get currentTime(): number { return this.ac?.currentTime ?? 0 }

  // ─── Immediate playback ───────────────────────────────────────────────────
  noteOn(midi: number, velocity = 0.8): void {
    if (!this.isReady) return
    const vel = Math.min(1, Math.max(0.01, velocity))
    try {
      if (this.player && this.ac) {
        const existing = this.activeNodes.get(midi)
        if (existing) { try { existing.stop(this.ac.currentTime + 0.02) } catch {} }
        const node = this.player.play(midiToNote(midi), this.ac.currentTime, { gain: vel * 5 })
        this.activeNodes.set(midi, node as unknown as AudioBufferSourceNode)
      } else if (this.fallbackSynth) {
        this.fallbackSynth.triggerAttack(
          Tone.Frequency(midi, 'midi').toFrequency(), Tone.now(), vel
        )
      }
    } catch { /* ignore */ }
  }

  noteOff(midi: number): void {
    if (!this.isReady) return
    try {
      if (this.player && this.ac) {
        const node = this.activeNodes.get(midi)
        if (node) {
          node.stop(this.ac.currentTime + 0.06)
          this.activeNodes.delete(midi)
        }
      } else if (this.fallbackSynth) {
        this.fallbackSynth.triggerRelease(
          Tone.Frequency(midi, 'midi').toFrequency(), Tone.now()
        )
      }
    } catch { /* ignore */ }
  }

  // ─── Scheduled playback (song playback) ──────────────────────────────────
  // `tailSec` is the extra audible time appended past `duration` for a
  // natural piano release.  Defaults to 1.5 s (PracticePage demo playback)
  // because piano samples sound abrupt without it.  Free-Mode playback
  // wants exact note cuts — pass a small tail (≈ 0.05 s) so seeking past
  // a sustained note doesn't bleed its tail into the supposed-silent gap.
  noteAtTime(midi: number, startTime: number, duration: number, velocity = 0.8, tailSec = 1.5): void {
    if (!this.isReady) return
    const vel = Math.min(1, Math.max(0.01, velocity))
    try {
      if (this.player) {
        const node = this.player.play(midiToNote(midi), startTime, { gain: vel * 5, duration: duration + tailSec })
        if (node) {
          const bufNode = node as unknown as AudioBufferSourceNode
          // Cache buffer for mid-note resume (offset playback)
          if (bufNode.buffer) this.bufferCache.set(midi, bufNode.buffer)
          this.scheduledNodes.set(bufNode, startTime)   // store start time for selective stop
          bufNode.onended = () => this.scheduledNodes.delete(bufNode)
        }
      } else if (this.fallbackSynth) {
        this.fallbackSynth.triggerAttackRelease(
          Tone.Frequency(midi, 'midi').toFrequency(), duration, startTime, vel
        )
      }
    } catch { /* ignore */ }
  }

  // ─── Mid-note resume: play from offset into the buffer (no re-attack) ────
  noteAtTimeWithOffset(midi: number, startTime: number, sampleOffset: number, duration: number, velocity = 0.8): void {
    if (!this.isReady || !this.ac || !this.gainNode) return
    const buf = this.bufferCache.get(midi)
    if (!buf) {
      // Buffer not cached yet — fall back to normal play
      this.noteAtTime(midi, startTime, duration, velocity)
      return
    }
    const vel = Math.min(1, Math.max(0.01, velocity))
    try {
      // Clamp offset so we don't seek past the end of the buffer
      const safeOffset = Math.max(0, Math.min(sampleOffset, buf.duration - 0.05))
      const gainNode = this.ac.createGain()
      gainNode.gain.value = vel * 5
      gainNode.connect(this.gainNode)

      const source = this.ac.createBufferSource()
      source.buffer = buf
      source.connect(gainNode)
      // start(when, offset, duration) — plays mid-sample, no attack transient
      source.start(startTime, safeOffset, duration + 0.5)

      this.scheduledNodes.set(source, startTime)   // store start time for selective stop
      source.onended = () => {
        this.scheduledNodes.delete(source)
        gainNode.disconnect()
      }
    } catch {
      this.noteAtTime(midi, startTime, duration, velocity)
    }
  }

  // ─── Stop all playing audio instantly ────────────────────────────────────
  stopAll(): void {
    const now = this.ac?.currentTime ?? 0
    // Stop immediately-triggered nodes
    this.activeNodes.forEach((node) => {
      try { node.stop(now) } catch { /* ignore */ }
    })
    this.activeNodes.clear()
    // Stop all scheduled (noteAtTime / noteAtTimeWithOffset) nodes
    this.scheduledNodes.forEach((_, node) => {
      try { node.stop(now) } catch { /* ignore */ }
    })
    this.scheduledNodes.clear()
    if (this.fallbackSynth) this.fallbackSynth.releaseAll()
    // Silence gain — do NOT auto-restore; call restoreVolume() before next play
    if (this.gainNode && this.ac) {
      this.gainNode.gain.cancelScheduledValues(now)
      this.gainNode.gain.setValueAtTime(0, now)
    }
  }

  // ─── Stop only future (not-yet-started) nodes — keeps currently playing ones ─
  // Use this for BPM change: avoids re-attack glitch on the current note while
  // ensuring future notes get re-scheduled at the new tempo.
  stopFutureNodes(): void {
    if (!this.ac) return
    const now = this.ac.currentTime
    this.scheduledNodes.forEach((startTime, node) => {
      if (startTime > now) {
        try { node.stop(now) } catch { /* ignore */ }
        this.scheduledNodes.delete(node)
      }
    })
  }

  // ─── Smooth fade-out (call at song end for natural tail-off) ─────────────
  fadeOut(durationSec: number): void {
    if (!this.gainNode || !this.ac) return
    const now = this.ac.currentTime
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(this._volume, now)
    this.gainNode.gain.linearRampToValueAtTime(0, now + durationSec)
  }

  // ─── Restore volume after stopAll (call before resuming playback) ─────────
  restoreVolume(): void {
    if (this.gainNode && this.ac) {
      const now = this.ac.currentTime
      this.gainNode.gain.cancelScheduledValues(now)
      this.gainNode.gain.setValueAtTime(this._volume, now)
    }
  }

  // ─── Volume ───────────────────────────────────────────────────────────────
  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol))
    if (this.gainNode && this.ac)
      this.gainNode.gain.setTargetAtTime(this._volume, this.ac.currentTime, 0.05)
  }
  getVolume(): number { return this._volume }

  duckVolume(durationMs = 400): void {
    // Temporarily lower gain WITHOUT touching _volume (user's setting stays intact)
    if (!this.gainNode || !this.ac) return
    const now = this.ac.currentTime
    const dur = durationMs / 1000
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(this._volume * 0.15, now)
    this.gainNode.gain.linearRampToValueAtTime(this._volume, now + dur)
  }

  // ─── Metronome ────────────────────────────────────────────────────────────
  private metronomeLoop:    Tone.Loop | null = null
  private clickSynthDown:   Tone.Synth | null = null   // phách 1 (accent)
  private clickSynthUp:     Tone.Synth | null = null   // phách 2-3-4

  startMetronome(bpm: number, numerator = 4): void {
    this.stopMetronome()
    Tone.Transport.bpm.value = bpm

    // Downbeat — C6, decay 0.04s (accent nặng hơn)
    this.clickSynthDown = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
      volume: -2
    }).toDestination()

    // Upbeat — G5, decay 0.03s (nhẹ hơn)
    this.clickSynthUp = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -4
    }).toDestination()

    let beat = 0
    this.metronomeLoop = new Tone.Loop((time) => {
      if (beat % numerator === 0) {
        this.clickSynthDown!.triggerAttackRelease('C6', '64n', time)
      } else {
        this.clickSynthUp!.triggerAttackRelease('G5', '64n', time)
      }
      beat++
    }, '4n')
    this.metronomeLoop.start(0)
    Tone.Transport.start()
  }

  // ─── Update metronome BPM without restarting (avoids double-click glitch) ──
  updateMetronomeBpm(bpm: number): void {
    if (!this.metronomeLoop) return
    Tone.Transport.bpm.value = bpm
  }

  stopMetronome(): void {
    this.metronomeLoop?.stop()
    this.metronomeLoop?.dispose()
    this.metronomeLoop = null
    this.clickSynthDown?.dispose()
    this.clickSynthDown = null
    this.clickSynthUp?.dispose()
    this.clickSynthUp = null
    Tone.Transport.stop()
  }

  dispose(): void {
    this.stopMetronome()
    this.gainNode?.disconnect()
    this.fallbackSynth?.dispose()
  }
}

export const audioEngine = new AudioEngine()
