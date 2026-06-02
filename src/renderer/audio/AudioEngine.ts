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

  // ─── Live sustain-pedal (damper) state ────────────────────────────────────
  // When the pedal is down, releasing a key does NOT stop the note — the node
  // moves into pedalHeld and keeps ringing until the pedal lifts.  Mirrors a
  // real piano damper; driven by CC64 from MidiContext.
  private pedalDown      = false
  private pedalHeld      = new Map<number, AudioBufferSourceNode>()
  private pedalHeldSynth = new Set<number>()   // fallback-synth equivalent

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

    // Prefer the soundfont bundled with the app (renderer/public/soundfonts) so
    // first launch on a fresh machine isn't gated on a cold-network CDN fetch.
    // It's read via IPC and handed to soundfont-player as a decoded
    // note→sample object: the URL path needs a real `.js` endpoint that a
    // packaged file:// can't satisfy (Electron's file:// XHR reports status 0,
    // which the loader treats as a failure).  CDN MusyngKite / FluidR3 stay as
    // fallbacks if the bundled asset is missing.
    const local = await this._loadLocalSoundfont()
    if (local && await this._tryLoad(local, 'MusyngKite')) return this.source
    if (await this._tryLoad('acoustic_grand_piano', 'MusyngKite')) return this.source
    if (await this._tryLoad('acoustic_grand_piano', 'FluidR3_GM')) return this.source

    this._createSynth()
    return this.source
  }

  // Read the bundled soundfont via IPC and parse its MIDI.js wrapper into the
  // `{ noteName: dataUri }` map soundfont-player decodes.  Mirrors the
  // library's own `midiJsToJson`.  Returns null (→ CDN fallback) if the asset
  // is absent or unparsable.
  private async _loadLocalSoundfont(): Promise<Record<string, string> | null> {
    try {
      const text = await window.electronAPI.getSoundfont()
      if (!text) return null
      const begin = text.indexOf('=', text.indexOf('MIDI.Soundfont.')) + 2
      const end   = text.lastIndexOf(',')
      return JSON.parse(text.slice(begin, end) + '}')
    } catch (e) {
      console.warn('[Audio] local soundfont parse failed:', e)
      return null
    }
  }

  private async _tryLoad(
    nameOrData: string | Record<string, string>,
    sf: string,
  ): Promise<boolean> {
    const local = typeof nameOrData !== 'string'
    try {
      this.player = await Promise.race<Awaited<ReturnType<typeof loadInstrument>>>([
        loadInstrument(this.ac!, nameOrData as unknown as Parameters<typeof loadInstrument>[1], {
          soundfont: sf,
          destination: this.gainNode!,
          gain: 5,
          format: 'mp3',
          // Pre-decoded object — tell soundfont-player to use it verbatim
          // instead of building a CDN URL from the (object) "name".
          ...(local ? { isSoundfontURL: () => true } : {}),
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 18_000))
      ])
      this.source  = sf === 'FluidR3_GM' ? 'FluidR3' : 'MusyngKite'
      this.isReady = true
      console.log(`[Audio] ${local ? 'local ' : ''}${sf} loaded`)
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
        // Re-striking a pitch the pedal is still holding: stop the held node.
        const held = this.pedalHeld.get(midi)
        if (held) { try { held.stop(this.ac.currentTime + 0.02) } catch {} this.pedalHeld.delete(midi) }
        const node = this.player.play(midiToNote(midi), this.ac.currentTime, { gain: vel * 5 })
        this.activeNodes.set(midi, node as unknown as AudioBufferSourceNode)
      } else if (this.fallbackSynth) {
        this.pedalHeldSynth.delete(midi)
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
          this.activeNodes.delete(midi)
          if (this.pedalDown) {
            // Pedal held — keep ringing; retire any prior held node for this pitch.
            const prev = this.pedalHeld.get(midi)
            if (prev && prev !== node) { try { prev.stop(this.ac.currentTime + 0.02) } catch {} }
            this.pedalHeld.set(midi, node)
          } else {
            node.stop(this.ac.currentTime + 0.06)
          }
        }
      } else if (this.fallbackSynth) {
        if (this.pedalDown) {
          this.pedalHeldSynth.add(midi)
        } else {
          this.fallbackSynth.triggerRelease(
            Tone.Frequency(midi, 'midi').toFrequency(), Tone.now()
          )
        }
      }
    } catch { /* ignore */ }
  }

  // ─── Live sustain pedal (CC64) ────────────────────────────────────────────
  // Driven by MidiContext when a real piano's damper pedal moves.  Pressing
  // holds released notes; releasing damps everything the pedal was holding.
  setSustainPedal(down: boolean): void {
    if (down === this.pedalDown) return
    this.pedalDown = down
    if (down) return
    if (this.ac) {
      const t = this.ac.currentTime + 0.02
      this.pedalHeld.forEach((node) => { try { node.stop(t) } catch {} })
    }
    this.pedalHeld.clear()
    if (this.fallbackSynth) {
      this.pedalHeldSynth.forEach((m) => {
        try { this.fallbackSynth!.triggerRelease(Tone.Frequency(m, 'midi').toFrequency(), Tone.now()) } catch {}
      })
    }
    this.pedalHeldSynth.clear()
  }

  // ─── Scheduled playback (song playback) ──────────────────────────────────
  // `tailSec` is a small extra audible time appended past `duration` so the
  // piano sample's natural release doesn't click off abruptly.  Real sustain
  // comes from the caller extending `duration` via the pedal timeline
  // (see audio/pedal.ts) — there is deliberately NO blanket sustain here.
  noteAtTime(midi: number, startTime: number, duration: number, velocity = 0.8, tailSec = 0.05): void {
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
    // Drop any pedal-held live nodes and reset the damper.
    this.pedalHeld.forEach((node) => { try { node.stop(now) } catch { /* ignore */ } })
    this.pedalHeld.clear()
    this.pedalHeldSynth.clear()
    this.pedalDown = false
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
