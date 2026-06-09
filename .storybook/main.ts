import { resolve } from 'path'
import { mergeConfig } from 'vite'
import type { StorybookConfig } from '@storybook/react-vite'

// Storybook drives the renderer with its own Vite config (NOT electron.vite.config.ts),
// so we re-declare the `@` / `@renderer` aliases here. Tailwind + PostCSS are picked up
// automatically from postcss.config.js.
// App contexts (Language / Theme / Midi) are provided globally in preview.tsx.
const config: StorybookConfig = {
  stories: ['../src/renderer/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  viteFinal: (cfg) =>
    mergeConfig(cfg, {
      resolve: {
        alias: {
          '@renderer': resolve(__dirname, '../src/renderer'),
          '@':         resolve(__dirname, '../src/renderer'),
        },
      },
    }),
}

export default config
