declare module 'soundfont-player' {
  interface PlayOptions {
    gain?: number
    duration?: number
    loop?: boolean
    release?: number
    attack?: number
    offset?: number
  }

  interface Player {
    play(
      note: string | number,
      when?: number,
      options?: PlayOptions
    ): AudioBufferSourceNode & { gain: GainNode }
    stop(time?: number): Player
    connect(destination: AudioNode): Player
    disconnect(): Player
  }

  function instrument(
    ac: AudioContext,
    name: string,
    options?: {
      soundfont?: string
      destination?: AudioNode
      gain?: number
      notes?: string[]
      format?: string
    }
  ): Promise<Player>

  export { instrument }
  const _default: { instrument: typeof instrument }
  export default _default
}
