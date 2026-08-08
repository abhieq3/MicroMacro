import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Alembic Digital blue — matches the logo "Alembic" & "DIGITAL" text
        brand: {
          50: '#E3F2FD',
          100: '#BBDEFB',
          200: '#90CAF9',
          300: '#64B5F6',
          400: '#42A5F5',
          500: '#1E88E5', // chevron bright blue
          600: '#1565C0', // core Alembic blue (logo text)
          700: '#1152A8',
          800: '#0D47A1', // dark navy
          900: '#0A3480', // sidebar deep navy
        },
        // Alembic progress green — matches the green chevron & "Touching Lives" text
        forest: {
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          300: '#81C784',
          400: '#66BB6A',
          500: '#43A047', // core Alembic green
          600: '#388E3C',
          700: '#2E7D32',
          800: '#1B5E20',
          900: '#1A4A1F',
        },
      },
      backgroundImage: {
        'alembic-gradient': 'linear-gradient(135deg, #0A3480 0%, #1565C0 60%, #1E88E5 100%)',
        'progress-gradient': 'linear-gradient(90deg, #1565C0, #43A047)',
        'chevron-gradient': 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
      },
      boxShadow: {
        brand: '0 4px 14px 0 rgba(21, 101, 192, 0.25)',
        forest: '0 4px 14px 0 rgba(67, 160, 71, 0.20)',
        card: '0 1px 3px 0 rgba(13, 71, 161, 0.08), 0 1px 2px -1px rgba(13,71,161,0.04)',
      },
      // Dialog widths. Every modal in the app uses one of these two tokens —
      // they MUST exist here: an undefined max-w-* class emits nothing, and a
      // `w-full` dialog then silently stretches to the whole viewport (the
      // "giant horizontal dialog" bug).
      maxWidth: {
        modal: '34rem', // 544px — forms with explanatory copy (sign-offs)
        'modal-sm': '27rem', // 432px — confirmations and single-field prompts
      },
    },
  },
  plugins: [],
};

export default config;
