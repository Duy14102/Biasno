/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        piano: {
          black: '#1a1a2e',
          dark: '#16213e',
          panel: '#0f3460',
          accent: '#e94560',
          blue: '#3b82f6',
          green: '#22c55e',
          yellow: '#f59e0b'
        }
      },
      animation: {
        'pulse-fast': 'pulse 0.5s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
