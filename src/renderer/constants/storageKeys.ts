export const LS = {
  FILE_LIST:         'biasno.fileList',
  FOLDER_PATH:       'biasno.folderPath',
  HIDDEN_PATHS:      'biasno.hiddenPaths',
  RESUME_POINTS:     'biasno.resumePoints',
  LEADERBOARDS:      'biasno.leaderboards',
  CHALLENGE_BY_SONG: 'biasno.challengeBySong',
  THEME:             'biasno.theme',
  LANG:              'biasno.lang',
  MIDI_KNOWN:        'biasno.midi.knownDevices',
  FREE_LIBRARY:      'freeMode:library:v1',
} as const

export type StorageKey = typeof LS[keyof typeof LS]
