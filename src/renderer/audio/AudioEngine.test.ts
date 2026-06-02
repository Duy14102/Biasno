import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── tone / soundfont mocks ───────────────────────────────────────────────────
// We control whether a soundfont "loads" via the shared `sf` fixture so we can
// exercise both the sampler path (player) and the PolySynth fallback path.
const sf = vi.hoisted(() => {
  const rawContext = { value: null as unknown }
  return {
    rawContext,
    started: { v: false },
    loadResult: { mode: 'ok' as 'ok' | 'fail' | 'timeout' },
    nowVal: { v: 100 },
    // spies for the fallback synth
    triggerAttack: vi.fn(),
    triggerRelease: vi.fn(),
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    playedNodes: [] as ReturnType<typeof makeNode>[],
  }
})

vi.mock('tone', () => {
  class Synth { triggerAttackRelease = vi.fn(); dispose = vi.fn(); toDestination() { return this } }
  class PolySynth {
    triggerAttack = sf.triggerAttack
    triggerRelease = sf.triggerRelease
    triggerAttackRelease = sf.triggerAttackRelease
    releaseAll = sf.releaseAll
    dispose = vi.fn()
    toDestination() { return this }
  }
  class Loop { start = vi.fn(); stop = vi.fn(); dispose = vi.fn(); constructor(_f: unknown, _i: unknown) {} }
  return {
    start: vi.fn(async () => { sf.started.v = true }),
    getContext: () => ({ rawContext: sf.rawContext.value }),
    now: () => sf.nowVal.v,
    Frequency: (m: number) => ({ toFrequency: () => 440 + m }),
    Synth,
    PolySynth,
    Loop,
    Transport: { bpm: { value: 0 }, start: vi.fn(), stop: vi.fn() },
  }
})

vi.mock('soundfont-player', () => ({
  instrument: vi.fn(async () => {
    if (sf.loadResult.mode === 'fail') throw new Error('load failed')
    if (sf.loadResult.mode === 'timeout') return new Promise(() => {}) // never resolves
    return {
      play: vi.fn(() => { const n = makeNode(); sf.playedNodes.push(n); return n }),
    }
  }),
}))

import { AudioEngine } from './AudioEngine'

// ─── Fake AudioContext ────────────────────────────────────────────────────────
function makeNode() {
  return { stop: vi.fn(), buffer: { duration: 3 }, connect: vi.fn(), start: vi.fn(), onended: null as null | (() => void) }
}

class FakeParam {
  value = 0
  cancelScheduledValues = vi.fn()
  setValueAtTime = vi.fn((v: number) => { this.value = v })
  setTargetAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
}
class FakeGain {
  gain = new FakeParam()
  connect = vi.fn()
  disconnect = vi.fn()
}
class FakeCtx {
  currentTime = 1000
  destination = {}
  createGain = vi.fn(() => new FakeGain())
  createBufferSource = vi.fn(() => makeNode())
}

let ctx: FakeCtx
beforeEach(() => {
  ctx = new FakeCtx()
  sf.rawContext.value = ctx
  sf.started.v = false
  sf.loadResult.mode = 'ok'
  sf.triggerAttack.mockClear()
  sf.triggerRelease.mockClear()
  sf.triggerAttackRelease.mockClear()
  sf.releaseAll.mockClear()
  sf.playedNodes.length = 0
})

async function sampler(): Promise<AudioEngine> {
  const e = new AudioEngine()
  sf.loadResult.mode = 'ok'
  await e.initialize()
  return e
}
async function synth(): Promise<AudioEngine> {
  const e = new AudioEngine()
  sf.loadResult.mode = 'fail'
  await e.initialize()
  return e
}

// ─── Initialization branches ──────────────────────────────────────────────────
describe('initialize', () => {
  it('resolves to MusyngKite when the first soundfont loads', async () => {
    const e = await sampler()
    expect(e.audioSource).toBe('MusyngKite')
    expect(e.ready).toBe(true)
    expect(sf.started.v).toBe(true)
  })

  it('falls back to the PolySynth when soundfonts fail', async () => {
    const e = await synth()
    expect(e.audioSource).toBe('synth')
    expect(e.ready).toBe(true)
  })

  it('is idempotent — a second initialize returns without re-running', async () => {
    const e = await sampler()
    const src = await e.initialize()
    expect(src).toBe('MusyngKite')
  })

  it('audioSourceLabel reflects the active source', async () => {
    expect((await sampler()).audioSourceLabel).toContain('MusyngKite')
    expect((await synth()).audioSourceLabel).toContain('Synth')
  })

  it('currentTime is 0 before init and ctx.currentTime after', async () => {
    const e = new AudioEngine()
    expect(e.currentTime).toBe(0)
    await e.initialize()
    expect(e.currentTime).toBe(ctx.currentTime)
  })
})

// ─── Guards: nothing happens before ready ─────────────────────────────────────
describe('not-ready guards', () => {
  it('noteOn / noteOff / noteAtTime are no-ops before initialize', () => {
    const e = new AudioEngine()
    e.noteOn(60)
    e.noteOff(60)
    e.noteAtTime(60, 0, 1)
    expect(sf.triggerAttack).not.toHaveBeenCalled()
  })
})

// ─── Sustain pedal bookkeeping (synth path — observable via triggerRelease) ───
describe('sustain pedal (synth path)', () => {
  it('releasing a key with pedal down defers the synth release', async () => {
    const e = await synth()
    e.setSustainPedal(true)
    e.noteOn(60)
    e.noteOff(60)
    expect(sf.triggerRelease).not.toHaveBeenCalled() // held by pedal
  })

  it('lifting the pedal releases everything it was holding', async () => {
    const e = await synth()
    e.setSustainPedal(true)
    e.noteOn(60); e.noteOff(60)
    e.noteOn(64); e.noteOff(64)
    sf.triggerRelease.mockClear()
    e.setSustainPedal(false)
    expect(sf.triggerRelease).toHaveBeenCalledTimes(2)
  })

  it('a redundant pedal toggle (same state) is ignored', async () => {
    const e = await synth()
    e.noteOn(60); e.noteOff(60)
    sf.triggerRelease.mockClear()
    e.setSustainPedal(false) // already up — early return, no churn
    expect(sf.triggerRelease).not.toHaveBeenCalled()
  })

  it('re-striking a held pitch clears it from the held set', async () => {
    const e = await synth()
    e.setSustainPedal(true)
    e.noteOn(60); e.noteOff(60)   // 60 now pedal-held
    e.noteOn(60)                  // re-strike clears held bookkeeping for 60
    sf.triggerRelease.mockClear()
    e.setSustainPedal(false)
    expect(sf.triggerRelease).not.toHaveBeenCalled()
  })

  it('with pedal up, releasing a key triggers the synth release immediately', async () => {
    const e = await synth()
    e.noteOn(60)
    e.noteOff(60)
    expect(sf.triggerRelease).toHaveBeenCalledTimes(1)
  })
})

// ─── Sustain pedal bookkeeping (sampler path — observable via node.stop) ──────
describe('sustain pedal (sampler path)', () => {
  it('noteOff with pedal down does NOT stop the node; pedal-up then stops it', async () => {
    const e = await sampler()
    e.setSustainPedal(true)
    e.noteOn(60)
    const node = sf.playedNodes[0]
    e.noteOff(60)                       // pedal down → node kept ringing
    expect(node.stop).not.toHaveBeenCalled()
    e.setSustainPedal(false)            // pedal up → damp held node
    expect(node.stop).toHaveBeenCalled()
  })

  it('re-striking a pedal-held pitch stops the prior held node and plays a fresh one', async () => {
    const e = await sampler()
    e.setSustainPedal(true)
    e.noteOn(60); e.noteOff(60)
    const held = sf.playedNodes[0]
    e.noteOn(60)                        // re-strike: stop held node, play new
    expect(held.stop).toHaveBeenCalled()
    expect(sf.playedNodes.length).toBe(2)
  })
})

// ─── Velocity clamp ───────────────────────────────────────────────────────────
describe('velocity clamp', () => {
  it('clamps to [0.01, 1] for noteOn on the synth', async () => {
    const e = await synth()
    e.noteOn(60, 5)        // over 1
    e.noteOn(62, -3)       // under 0.01
    const vels = sf.triggerAttack.mock.calls.map((c) => c[2] as number)
    expect(vels[0]).toBe(1)
    expect(vels[1]).toBe(0.01)
  })

  it('clamps velocity for scheduled notes on the synth', async () => {
    const e = await synth()
    e.noteAtTime(60, 0, 1, 9)
    expect(sf.triggerAttackRelease.mock.calls[0][3]).toBe(1)
  })
})

// ─── Volume contract: setVolume clamps; stopAll mutes; restoreVolume reinstates ─
describe('volume contract', () => {
  it('setVolume clamps to [0,1] and getVolume reflects it', async () => {
    const e = await sampler()
    e.setVolume(2)
    expect(e.getVolume()).toBe(1)
    e.setVolume(-1)
    expect(e.getVolume()).toBe(0)
  })

  it('stopAll silences the gain to 0 and does NOT auto-restore', async () => {
    const e = await sampler()
    const g = ctx.createGain.mock.results[0].value as FakeGain
    g.gain.setValueAtTime.mockClear()
    e.stopAll()
    expect(g.gain.setValueAtTime).toHaveBeenLastCalledWith(0, ctx.currentTime)
  })

  it('restoreVolume sets the gain back to the stored _volume', async () => {
    const e = await sampler()
    e.setVolume(0.5)
    const g = ctx.createGain.mock.results[0].value as FakeGain
    g.gain.setValueAtTime.mockClear()
    e.restoreVolume()
    expect(g.gain.setValueAtTime).toHaveBeenCalledWith(0.5, ctx.currentTime)
  })

  it('stopAll resets pedalDown and calls releaseAll on the synth', async () => {
    const e = await synth()
    e.setSustainPedal(true)
    e.stopAll()
    expect(sf.releaseAll).toHaveBeenCalled()
    // pedal reset: a subsequent up-toggle is a no-op (state already up)
    sf.triggerRelease.mockClear()
    e.setSustainPedal(false)
    expect(sf.triggerRelease).not.toHaveBeenCalled()
  })

  it('fadeOut ramps the gain to 0 over the given duration', async () => {
    const e = await sampler()
    const g = ctx.createGain.mock.results[0].value as FakeGain
    e.fadeOut(2)
    expect(g.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime + 2)
  })

  it('duckVolume dips to 15% then ramps back without touching _volume', async () => {
    const e = await sampler()
    e.setVolume(0.8)
    const g = ctx.createGain.mock.results[0].value as FakeGain
    g.gain.setValueAtTime.mockClear()
    e.duckVolume(400)
    expect(g.gain.setValueAtTime).toHaveBeenCalledWith(0.8 * 0.15, ctx.currentTime)
    expect(e.getVolume()).toBe(0.8) // unchanged
  })
})

// ─── noteAtTimeWithOffset: offset clamp + buffer-cache fallback ───────────────
describe('noteAtTimeWithOffset', () => {
  it('falls back to noteAtTime when the buffer is not yet cached', async () => {
    const e = await sampler()
    // No prior noteAtTime → bufferCache empty → fallback path (no createBufferSource)
    e.noteAtTimeWithOffset(60, 0, 1, 2)
    expect(ctx.createBufferSource).not.toHaveBeenCalled()
  })

  it('clamps the sample offset to within the buffer duration', async () => {
    const e = await sampler()
    e.noteAtTime(60, 0, 1) // caches a buffer (duration 3)
    const src = makeNode()
    ctx.createBufferSource.mockReturnValueOnce(src)
    e.noteAtTimeWithOffset(60, 0, /*offset*/ 99, 1)
    // offset clamped to buf.duration - 0.05 = 2.95
    expect(src.start).toHaveBeenCalledWith(0, 2.95, 1.5)
  })
})

// ─── stopFutureNodes: only future scheduled nodes are stopped ─────────────────
describe('stopFutureNodes', () => {
  it('is a no-op when there is no context', () => {
    const e = new AudioEngine()
    expect(() => e.stopFutureNodes()).not.toThrow()
  })

  it('stops only nodes scheduled after currentTime', async () => {
    const e = await sampler()
    const future = makeNode()
    const past = makeNode()
    // schedule one in the future, one in the past, by stubbing player.play return
    // via direct noteAtTime calls with controlled startTimes.
    ;(e as unknown as { scheduledNodes: Map<unknown, number> }).scheduledNodes.set(future, ctx.currentTime + 10)
    ;(e as unknown as { scheduledNodes: Map<unknown, number> }).scheduledNodes.set(past, ctx.currentTime - 10)
    e.stopFutureNodes()
    expect(future.stop).toHaveBeenCalled()
    expect(past.stop).not.toHaveBeenCalled()
  })
})

// ─── Metronome wiring ─────────────────────────────────────────────────────────
describe('metronome', () => {
  it('startMetronome sets transport bpm and starts a loop; updateMetronomeBpm updates without restart', async () => {
    const Tone = await import('tone')
    const e = await sampler()
    e.startMetronome(120, 4)
    expect(Tone.Transport.bpm.value).toBe(120)
    expect((Tone.Transport.start as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    e.updateMetronomeBpm(90)
    expect(Tone.Transport.bpm.value).toBe(90)
  })

  it('updateMetronomeBpm before start is a no-op', async () => {
    const Tone = await import('tone')
    const e = await sampler()
    Tone.Transport.bpm.value = 0
    e.updateMetronomeBpm(150)
    expect(Tone.Transport.bpm.value).toBe(0) // unchanged — loop not running
  })
})
