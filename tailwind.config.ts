import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // X / Twitter palette
        x: {
          blue: '#1d9bf0',
          'blue-hover': '#1a8cd8',
          green: '#00ba7c',
          red: '#f4212e',
          pink: '#f91880',
          border: '#2f3336',
          muted: '#71767b',
          text: '#e7e9ea',
          ink: '#0f1419',
          surface: '#16181c',
          hover: 'rgba(231,233,234,0.1)',
        },
        brand: {
          50: '#eff3f4',
          100: '#e7e9ea',
          200: '#cfd9de',
          300: '#aab8c2',
          400: '#71767b',
          500: '#536471',
          600: '#1d9bf0',
          700: '#0f1419',
          800: '#0f1419',
          900: '#000000',
        },
        forest: {
          50: 'rgba(0,186,124,0.12)',
          100: 'rgba(0,186,124,0.18)',
          200: '#00ba7c',
          300: '#00ba7c',
          400: '#00ba7c',
          500: '#00ba7c',
          600: '#00ba7c',
          700: '#008f5f',
          800: '#006b47',
          900: '#004d33',
        },
      },
      backgroundImage: {
        'alembic-gradient': 'none',
        'progress-gradient': 'linear-gradient(90deg, #1d9bf0, #1a8cd8)',
        'chevron-gradient': 'none',
      },
      boxShadow: {
        brand: 'none',
        forest: 'none',
        card: 'none',
        x: '0 0 15px rgba(255,255,255,0.1)',
      },
      borderRadius: {
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      maxWidth: {
        modal: '34rem',
        'modal-sm': '27rem',
      },
      fontSize: {
        // X uses ~15px body, ~20px titles
        base: ['15px', { lineHeight: '1.4' }],
      },
    },
  },
  plugins: [],
};

export default config;
