import React, { useEffect } from 'react'
import type { Preview, Decorator } from '@storybook/react-vite'
import { LanguageProvider } from '@/i18n'
import { ThemeProvider, MidiProvider, useTheme } from '@/context'
import '../src/renderer/index.css'

// Push the toolbar theme into the app's own ThemeProvider (which owns the
// `html.dark` class), so the toggle drives real components, not just a class.
function ThemeSync({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  const { setTheme } = useTheme()
  useEffect(() => { setTheme(theme) }, [theme, setTheme])
  return <>{children}</>
}

// Every component reaches for Language / Theme / Midi context, so the whole app
// provider stack wraps each story. MidiProvider degrades gracefully when the
// Web MIDI API is absent (supported = false), so it's safe outside Electron.
const withProviders: Decorator = (Story, ctx) => (
  <LanguageProvider>
    <ThemeProvider>
      <MidiProvider>
        <ThemeSync theme={ctx.globals.theme === 'light' ? 'light' : 'dark'}>
          <div style={{ padding: 24 }}>
            <Story />
          </div>
        </ThemeSync>
      </MidiProvider>
    </ThemeProvider>
  </LanguageProvider>
)

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'App theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [withProviders],
}

export default preview
