import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mars: {
          DEFAULT: '#c2410c',
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ea580c',
          600: '#c2410c',
          700: '#9a3412',
          800: '#7c2d12',
          900: '#431407',
        },
        x: {
          blue: '#c2410c',
          'blue-hover': '#9a3412',
          green: '#15803d',
          red: '#dc2626',
          pink: '#e11d48',
          border: '#e7e5e4',
          muted: '#78716c',
          text: '#1c1917',
          ink: '#1c1917',
          surface: '#f5f2ed',
          hover: 'rgba(28,25,23,0.06)',
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ea580c',
          600: '#c2410c',
          700: '#9a3412',
          800: '#1c1917',
          900: '#0c0a09',
        },
        forest: {
          50: 'rgba(21,128,61,0.12)',
          100: 'rgba(21,128,61,0.18)',
          200: '#15803d',
          300: '#15803d',
          400: '#15803d',
          500: '#15803d',
          600: '#15803d',
          700: '#166534',
          800: '#14532d',
          900: '#052e16',
        },
      },
      backgroundImage: {
        'alembic-gradient': 'none',
        'progress-gradient': 'linear-gradient(90deg, #c2410c, #ea580c)',
        'chevron-gradient': 'none',
      },
      boxShadow: {
        brand: 'none',
        forest: 'none',
        card: '0 1px 2px rgba(28, 25, 23, 0.04)',
        x: '0 0 15px rgba(194, 65, 12, 0.08)',
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
        base: ['15px', { lineHeight: '1.4' }],
      },
    },
  },
  plugins: [],
};

export default config;
