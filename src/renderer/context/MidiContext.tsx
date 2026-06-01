// ─── MIDI device context ────────────────────────────────────────────────────
// Single source of truth for the Web MIDI connection. Owns:
//   • Live device list (currently visible to the OS)
//   • Known-device list (devices the app has successfully connected to before,
//     persisted to localStorage).  Remembered-but-offline devices stay in the
//     UI so the user can re-connect by plugging them back in.
//   • A pub/sub for note callbacks so any page (HomePage / PracticePage) can
//     subscribe without the underlying connection breaking when routes change.
//
// Auto-connect rule: when a device appears for the first time this session
// (initial scan or hot-plug) AND we have no active connection, connect to the
// most-recently-used remembered device that's online — otherwise, if only one
// device is available, connect to it.  Manual disconnect does NOT trigger an
// auto-reconnect; only fresh hot-plug events do.
//
// Disconnect notice: when the actively-connected device disappears from the
// OS device list mid-session, surface a notice so any page can render a toast.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { MidiDevice } from '@/types'
import { useLanguage } from '@/i18n'
import { LS } from '@/constants'
import { loadJSON, saveJSON } from '@/utils'

const MIN_CONNECT_MS = 350

export type MidiNoteCallback = (midi: number, velocity: number, on: boolean) => void
export type MidiPedalCallback = (down: boolean) => void

interface KnownDevice {
  id:              string
  name:            string
  lastConnectedAt: number
}

export interface MidiDeviceView extends MidiDevice {
  online:     boolean
  remembered: boolean
}

interface MidiContextValue {
  supported:               boolean
  devices:                 MidiDeviceView[]
  connectedId:             string | null
  connecting:              string | null
  connectError:            { deviceId: string; message: string } | null
  disconnectNotice:        { name: string } | null
  globalError:             string | null
  connect:                 (deviceId: string) => void
  disconnect:              () => void
  forgetDevice:            (deviceId: string) => void
  dismissDisconnectNotice: () => void
  dismissConnectError:     () => void
  subscribe:               (cb: MidiNoteCallback) => () => void
  subscribePedal:          (cb: MidiPedalCallback) => () => void
}

const MidiContext = createContext<MidiContextValue | null>(null)

function loadKnown(): KnownDevice[] {
  const parsed = loadJSON<unknown[]>(LS.MIDI_KNOWN, [], Array.isArray)
  return parsed.filter((x: unknown): x is KnownDevice =>
    typeof x === 'object' && x !== null &&
    typeof (x as KnownDevice).id === 'string' &&
    typeof (x as KnownDevice).name === 'string' &&
    typeof (x as KnownDevice).lastConnectedAt === 'number',
  )
}

export function MidiProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { t } = useLanguage()

  const [supported,        setSupported]        = useState(false)
  const [liveDevices,      setLiveDevices]      = useState<MidiDevice[]>([])
  const [known,            setKnown]            = useState<KnownDevice[]>(loadKnown)
  const [connectedId,      setConnectedId]      = useState<string | null>(null)
  const [connecting,       setConnecting]       = useState<string | null>(null)
  const [connectError,     setConnectError]     = useState<MidiContextValue['connectError']>(null)
  const [disconnectNotice, setDisconnectNotice] = useState<MidiContextValue['disconnectNotice']>(null)
  const [globalError,      setGlobalError]      = useState<string | null>(null)

  // Refs mirror state for use inside stable callbacks / event handlers that
  // mustn't re-bind every render.
  const accessRef        = useRef<MIDIAccess | null>(null)
  const subscribersRef   = useRef<Set<MidiNoteCallback>>(new Set())
  const pedalSubsRef     = useRef<Set<MidiPedalCallback>>(new Set())
  const seenIdsRef       = useRef<Set<string>>(new Set())
  const connectedIdRef   = useRef<string | null>(null)
  const connectingRef    = useRef<string | null>(null)
  const knownRef         = useRef<KnownDevice[]>(known)
  const liveRef          = useRef<MidiDevice[]>([])
  const tFn              = useRef(t)

  useEffect(() => { tFn.current = t }, [t])
  useEffect(() => { knownRef.current = known; saveJSON(LS.MIDI_KNOWN, known) }, [known])
  useEffect(() => { liveRef.current = liveDevices }, [liveDevices])
  useEffect(() => { connectedIdRef.current = connectedId }, [connectedId])
  useEffect(() => { connectingRef.current = connecting }, [connecting])

  // ─── Dispatcher attached to the active input's onmidimessage ───────────────
  // Stable function — re-attached to whichever input is current. Fans out to
  // all subscribers so multiple consumers (e.g. HomePage audio preview +
  // PracticePage matcher) can share one connection.
  const dispatchMessage = useCallback((e: MIDIMessageEvent): void => {
    if (!e.data || e.data.length < 2) return
    const [status, note, velocity] = Array.from(e.data)
    const cmd = status & 0xf0
    if (cmd === 0x90 && velocity > 0) {
      subscribersRef.current.forEach(cb => cb(note, velocity / 127, true))
    } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
      subscribersRef.current.forEach(cb => cb(note, 0, false))
    } else if (cmd === 0xb0 && note === 64) {
      // Sustain-pedal (CC64).  `cmd` already masks the channel (status & 0xf0),
      // so the pedal is caught on any channel 1–16, not just channel 1.  `note`
      // holds the controller number, `velocity` the value.  Standard MIDI
      // binary threshold: ≥ 64 = down, 0–63 = up (no continuous half-pedal).
      const down = velocity >= 64
      pedalSubsRef.current.forEach(cb => cb(down))
    }
  }, [])

  const detachAll = useCallback(() => {
    const access = accessRef.current
    if (!access) return
    access.inputs.forEach(i => { i.onmidimessage = null })
    // Safety: a detached device can't send pedal-up, so release it ourselves
    // to avoid a stuck damper after disconnect / device switch.
    pedalSubsRef.current.forEach(cb => cb(false))
  }, [])

  const tryAttach = useCallback(async (deviceId: string): Promise<{ ok: boolean; error?: 'offline' | 'open-failed'; openMsg?: string; name?: string }> => {
    const access = accessRef.current
    if (!access) return { ok: false, error: 'offline' }
    const input = access.inputs.get(deviceId)
    if (!input) return { ok: false, error: 'offline' }
    detachAll()
    try {
      if (typeof input.open === 'function') await input.open()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: 'open-failed', openMsg: msg, name: input.name ?? undefined }
    }
    input.onmidimessage = dispatchMessage
    return { ok: true, name: input.name ?? deviceId }
  }, [detachAll, dispatchMessage])

  const connect = useCallback((deviceId: string): void => {
    if (connectingRef.current) return
    // Toggle off: clicking the currently-connected device disconnects manually.
    if (connectedIdRef.current === deviceId) {
      detachAll()
      setConnectedId(null)
      return
    }
    setConnecting(deviceId)
    setConnectError(null)
    const start = performance.now()
    void tryAttach(deviceId).then(async (res) => {
      const elapsed = performance.now() - start
      if (elapsed < MIN_CONNECT_MS) await new Promise(r => setTimeout(r, MIN_CONNECT_MS - elapsed))
      if (res.ok) {
        setConnectedId(deviceId)
        const now = Date.now()
        setKnown(prev => {
          const existing = prev.find(k => k.id === deviceId)
          const name = res.name || existing?.name || deviceId
          return [...prev.filter(k => k.id !== deviceId), { id: deviceId, name, lastConnectedAt: now }]
        })
      } else if (res.error === 'offline') {
        setConnectError({ deviceId, message: tFn.current('errDeviceOffline') })
      } else {
        setConnectError({ deviceId, message: tFn.current('errConnectFailed', { msg: res.openMsg || '' }) })
      }
      setConnecting(null)
    })
  }, [detachAll, tryAttach])

  const disconnect = useCallback(() => {
    detachAll()
    setConnectedId(null)
  }, [detachAll])

  const forgetDevice = useCallback((deviceId: string) => {
    setKnown(prev => prev.filter(k => k.id !== deviceId))
    if (connectedIdRef.current === deviceId) {
      detachAll()
      setConnectedId(null)
    }
  }, [detachAll])

  const subscribe = useCallback((cb: MidiNoteCallback) => {
    subscribersRef.current.add(cb)
    return () => { subscribersRef.current.delete(cb) }
  }, [])

  const subscribePedal = useCallback((cb: MidiPedalCallback) => {
    pedalSubsRef.current.add(cb)
    return () => { pedalSubsRef.current.delete(cb) }
  }, [])

  const tryAutoConnect = useCallback((newIds: string[]) => {
    if (connectedIdRef.current || connectingRef.current) return
    if (newIds.length === 0) return
    const live = liveRef.current
    // Prefer a remembered device that's now online — most recently used wins.
    const onlineKnown = knownRef.current
      .filter(k => live.some(d => d.id === k.id))
      .sort((a, b) => b.lastConnectedAt - a.lastConnectedAt)
    if (onlineKnown.length > 0) {
      connect(onlineKnown[0].id)
      return
    }
    // No remembered device available — connect only if there's exactly one
    // live device (unambiguous).  With multiple unknown devices, wait for the
    // user to pick.
    if (live.length === 1) connect(live[0].id)
  }, [connect])

  // ─── Web MIDI init + onstatechange handling ───────────────────────────────
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setSupported(false)
      setGlobalError(tFn.current('errMidiNotSupported'))
      return
    }
    setSupported(true)
    let cancelled = false
    navigator.requestMIDIAccess({ sysex: false }).then((access) => {
      if (cancelled) return
      accessRef.current = access

      const refresh = (): void => {
        const inputs: MidiDevice[] = []
        access.inputs.forEach(i => inputs.push({
          id:   i.id,
          name: i.name || `MIDI Input ${i.id}`,
          type: 'input',
        }))
        // Diff against what we've seen this session — new IDs are eligible
        // for auto-connect, removed IDs come out of the seen set so a future
        // re-plug counts as "new" again.
        const liveIds = new Set(inputs.map(i => i.id))
        const newIds: string[] = []
        inputs.forEach(i => { if (!seenIdsRef.current.has(i.id)) newIds.push(i.id) })
        seenIdsRef.current.forEach(id => { if (!liveIds.has(id)) seenIdsRef.current.delete(id) })
        newIds.forEach(id => seenIdsRef.current.add(id))

        setLiveDevices(inputs)

        // Active device went offline → surface notice + clear connection.
        const activeId = connectedIdRef.current
        if (activeId && !liveIds.has(activeId)) {
          const name = knownRef.current.find(k => k.id === activeId)?.name || activeId
          setDisconnectNotice({ name })
          setConnectedId(null)
        }

        if (newIds.length > 0) tryAutoConnect(newIds)
      }

      refresh()
      access.onstatechange = () => refresh()
    }).catch((err: unknown) => {
      if (cancelled) return
      const msg = err instanceof Error ? err.message : String(err)
      setGlobalError(tFn.current('errCantAccessMidi', { msg }))
    })
    return () => { cancelled = true }
  }, [tryAutoConnect])

  // ─── Build view-model (live + remembered-but-offline) ─────────────────────
  const devices: MidiDeviceView[] = useMemo(() => {
    const out: MidiDeviceView[] = []
    const seen = new Set<string>()
    for (const d of liveDevices) {
      out.push({ ...d, online: true, remembered: known.some(k => k.id === d.id) })
      seen.add(d.id)
    }
    // Append remembered-but-offline in most-recently-used order.
    const offline = known
      .filter(k => !seen.has(k.id))
      .sort((a, b) => b.lastConnectedAt - a.lastConnectedAt)
    for (const k of offline) {
      out.push({ id: k.id, name: k.name, type: 'input', online: false, remembered: true })
    }
    return out
  }, [liveDevices, known])

  const dismissDisconnectNotice = useCallback(() => setDisconnectNotice(null), [])
  const dismissConnectError     = useCallback(() => setConnectError(null), [])

  return (
    <MidiContext.Provider value={{
      supported, devices, connectedId, connecting, connectError, disconnectNotice, globalError,
      connect, disconnect, forgetDevice,
      dismissDisconnectNotice, dismissConnectError, subscribe, subscribePedal,
    }}>
      {children}
    </MidiContext.Provider>
  )
}

export function useMidi(): MidiContextValue {
  const ctx = useContext(MidiContext)
  if (!ctx) throw new Error('useMidi must be used within MidiProvider')
  return ctx
}
