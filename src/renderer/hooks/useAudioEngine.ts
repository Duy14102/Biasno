import { useEffect, useState } from 'react'
import { audioEngine } from '../audio/AudioEngine'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function useAudioEngine() {
  const [loadState,       setLoadState]       = useState<LoadState>('idle')
  const [audioSourceLabel, setAudioSourceLabel] = useState('⌛ Đang tải...')

  useEffect(() => {
    if (audioEngine.ready) {
      setLoadState('ready')
      setAudioSourceLabel(audioEngine.audioSourceLabel)
      return
    }
    setLoadState('loading')
    audioEngine.initialize().then(() => {
      setLoadState('ready')
      setAudioSourceLabel(audioEngine.audioSourceLabel)
    }).catch(() => {
      setLoadState('error')
      setAudioSourceLabel('⚠ Lỗi')
    })
  }, [])

  return { loadState, audioSourceLabel, engine: audioEngine }
}
