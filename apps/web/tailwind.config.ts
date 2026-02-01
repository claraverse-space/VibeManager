import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Background colors
        bg: {
          DEFAULT: 'var(--bg)',
          primary: 'var(--bg)',
          secondary: 'var(--surface)',
          tertiary: 'var(--surface2)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          '2': 'var(--surface2)',
          '3': 'var(--surface3)',
        },
        // Accent colors
        accent: {
          DEFAULT: 'var(--accent)',
          dim: 'var(--accent-dim)',
          blue: '#3b82f6',
          green: 'var(--success)',
          yellow: 'var(--warn)',
          red: 'var(--danger)',
          purple: '#a855f7',
          orange: '#f97316',
        },
        // Text colors
        'text-primary': 'var(--text)',
        'text-secondary': 'var(--text-dim)',
        'text-dim': 'var(--text-dim)',
        // Status colors
        danger: 'var(--danger)',
        success: 'var(--success)',
        warn: 'var(--warn)',
        // Border colors
        border: {
          primary: 'var(--surface3)',
          secondary: 'var(--surface2)',
        },
      },
      fontFamily: {
        sans: ['Satoshi', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        none: '0',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'co-pulse': 'co-pulse 0.8s ease-in-out infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'co-pulse': {
          '0%, 100%': { opacity: '0.2', transform: 'scaleY(0.6)' },
          '50%': { opacity: '1', transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
