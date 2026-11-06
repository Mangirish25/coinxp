import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef8f6', 100: '#d5eeea', 500: '#258f82', 600: '#1b746a', 700: '#165d56' },
        ink: { 900: '#142421', 700: '#3e514d', 500: '#75827e' },
        canvas: '#f5f7f6',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '1.25rem' },
    },
  },
  plugins: [],
} satisfies Config;
