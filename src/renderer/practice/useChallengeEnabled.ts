import { useCallback, useEffect, useState } from 'react'
import { LS } from '@/constants'
import { loadJSON, saveJSON, isPlainObject } from '@/utils'

type ChallengeMap = Record<string, boolean>

const loadAll = (): ChallengeMap =>
  loadJSON<ChallengeMap>(LS.CHALLENGE_BY_SONG, {}, isPlainObject)

export function useChallengeEnabled(songName: string | null): [boolean, (next: boolean) => void] {
  const [map, setMap] = useState<ChallengeMap>(loadAll)

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== LS.CHALLENGE_BY_SONG) return
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
      saveJSON(LS.CHALLENGE_BY_SONG, out)
      return out
    })
  }, [songName])

  return [enabled, set]
}
