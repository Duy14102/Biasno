// ─── Per-song challenge toggle ──────────────────────────────────────────────
// Each song remembers its own challenge on/off state, defaulting to OFF.
// That way the user can leave a tough piece in free-play while another piece
// is scored — without the global flag flipping behind their back.
//
// Storage shape:  { [midiName]: boolean }
// Default for missing entries: false.
//
// A `storage` listener keeps multiple tabs / windows in sync (mostly relevant
// in dev — the packaged app runs as a single window).

import { useCallback, useEffect, useState } from 'react'

export const LS_CHALLENGE_BY_SONG = 'biasno.challengeBySong'

type Map = Record<string, boolean>

function loadAll(): Map {
  try {
    const raw = localStorage.getItem(LS_CHALLENGE_BY_SONG)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch { return {} }
}

function saveAll(map: Map): void {
  try { localStorage.setItem(LS_CHALLENGE_BY_SONG, JSON.stringify(map)) } catch { /* quota */ }
}

/** Per-song challenge flag.  Pass `null` (e.g. before a song is selected) and
 *  the returned value is `false`; the setter is a no-op. */
export function useChallengeEnabled(songName: string | null): [boolean, (next: boolean) => void] {
  const [map, setMap] = useState<Map>(loadAll)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_CHALLENGE_BY_SONG) return
      setMap(loadAll())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const enabled = songName ? !!map[songName] : false

  const set = useCallback((next: boolean) => {
    if (!songName) return
    setMap((prev) => {
      const out = { ...prev, [songName]: next }
      saveAll(out)
      return out
    })
  }, [songName])

  return [enabled, set]
}
