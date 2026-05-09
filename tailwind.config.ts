import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Obsidian Protocol palette
        void: {
          DEFAULT: '#05060a',
          50: '#0a0c14',
          100: '#0f111c',
          200: '#141826',
          300: '#1a1f30',
        },
        cyan: {
          neon: '#00f9ff',
          glow: '#7df9ff',
          dark: '#006d70',
        },
        magenta: {
          neon: '#ff00aa',
          glow: '#ff66cc',
          dark: '#660044',
        },
        toxic: {
          DEFAULT: '#9d00ff',
          glow: '#c466ff',
          dark: '#3d0066',
        },
        signal: {
          amber: '#ffb000',
          red: '#ff2a4d',
          green: '#39ff14',
        },
      },
      fontFamily: {
        terminal: ['var(--font-share-tech)', 'ui-monospace', 'monospace'],
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        'neon-cyan': '0 0 12px rgba(0, 249, 255, 0.6), 0 0 32px rgba(0, 249, 255, 0.25)',
        'neon-magenta': '0 0 12px rgba(255, 0, 170, 0.6), 0 0 32px rgba(255, 0, 170, 0.25)',
        'neon-toxic': '0 0 12px rgba(157, 0, 255, 0.6), 0 0 32px rgba(157, 0, 255, 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'flicker': 'flicker 2.4s linear infinite',
        'scanline': 'scanline 6s linear infinite',
        'glitch': 'glitch 1.8s steps(2, end) infinite',
      },
      keyframes: {
        flicker: {
          '0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%': { opacity: '1' },
          '20%, 21.999%, 63%, 63.999%, 65%, 69.999%': { opacity: '0.55' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '20%': { transform: 'translate(-1px, 1px)' },
          '40%': { transform: 'translate(-1px, -1px)' },
          '60%': { transform: 'translate(1px, 1px)' },
          '80%': { transform: 'translate(1px, -1px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
