import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, MidiProvider, ThemeProvider } from '@/context'
import { LanguageProvider } from '@/i18n'
import { AudioGate, RequireAudio, MidiDisconnectToast } from '@/components'
import { HomePage, ModePage, PracticePage, FreeModePage } from '@/pages'

// Opt into React Router v7 defaults now so the eventual major bump is silent.
const ROUTER_FUTURE = {
  v7_startTransition:   true,
  v7_relativeSplatPath: true,
} as const

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AudioGate>
          <AppProvider>
            <MidiProvider>
              <HashRouter future={ROUTER_FUTURE}>
                <Routes>
                  <Route path="/"         element={<HomePage />} />
                  <Route path="/mode"     element={<ModePage />} />
                  <Route path="/practice" element={<RequireAudio><PracticePage /></RequireAudio>} />
                  <Route path="/free"     element={<RequireAudio><FreeModePage /></RequireAudio>} />
                  <Route path="*"         element={<Navigate to="/" replace />} />
                </Routes>
              </HashRouter>
              {/* Outside Routes so a mid-practice unplug surfaces on every page. */}
              <MidiDisconnectToast />
            </MidiProvider>
          </AppProvider>
        </AudioGate>
      </LanguageProvider>
    </ThemeProvider>
  )
}
