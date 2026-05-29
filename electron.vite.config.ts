import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'

const obfuscate = obfuscator({
  include: ['**/*.js', '**/*.ts', '**/*.tsx'],
  exclude: ['node_modules/**'],
  apply: 'build',
  debugger: false,
  options: {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: false,
    numbersToExpressions: true,
    simplify: true,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
  },
})

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
    plugins: [obfuscate],
  },
  preload: {
    build: { externalizeDeps: true },
    plugins: [obfuscate],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@':         resolve('src/renderer'),
        events: 'events',
      },
    },
    plugins: [react(), obfuscate],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
})
