import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { MidiProvider } from './context/MidiContext'
import { AudioGate } from './components/AudioGate'
import MidiDisconnectToast from './components/MidiDisconnectToast'
import HomePage from './pages/HomePage'
import ModePage from './pages/ModePage'
import PracticePage from './pages/PracticePage'

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AudioGate>
          <AppProvider>
            <MidiProvider>
              <HashRouter>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/mode" element={<ModePage />} />
                  <Route path="/practice" element={<PracticePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
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
