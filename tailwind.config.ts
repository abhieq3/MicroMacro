import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Monochrome brand — pure ink. No corporate blue/green.
        brand: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#3f3f46',
          700: '#18181b',
          800: '#09090b',
          900: '#000000',
        },
        // Status green only — not a second brand identity
        forest: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      backgroundImage: {
        'alembic-gradient': 'none',
        'progress-gradient': 'linear-gradient(90deg, #000000, #18181b)',
        'chevron-gradient': 'none',
      },
      boxShadow: {
        brand: 'none',
        forest: 'none',
        card: 'none',
      },
      borderRadius: {
        lg: '4px',
        xl: '6px',
        '2xl': '8px',
        '3xl': '10px',
      },
      maxWidth: {
        modal: '34rem',
        'modal-sm': '27rem',
      },
    },
  },
  plugins: [],
};

export default config;
