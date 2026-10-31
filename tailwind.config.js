/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tor: {
          bg: '#0a0d14',
          surface: '#111726',
          panel: '#161f33',
          border: '#23304b',
          accent: '#7d4698', // Tor purple
          accentHover: '#9655b6',
          onion: '#a855f7',
          neon: '#06b6d4', // Cyan neon
          emerald: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      boxShadow: {
        'glow-purple': '0 0 15px -3px rgba(168, 85, 247, 0.4)',
        'glow-cyan': '0 0 15px -3px rgba(6, 182, 212, 0.4)',
        'glow-green': '0 0 15px -3px rgba(16, 185, 129, 0.4)',
      }
    },
  },
  plugins: [],
}
