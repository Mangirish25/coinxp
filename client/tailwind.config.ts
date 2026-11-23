import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: 'var(--coinxp-brand-50, #eef8f6)', 100: 'var(--coinxp-brand-100, #d5eeea)', 500: 'var(--coinxp-brand-500, #258f82)', 600: 'var(--coinxp-brand-600, #1b746a)', 700: 'var(--coinxp-brand-700, #165d56)' },
        ink: { 900: 'var(--coinxp-ink-900, #142421)', 700: 'var(--coinxp-ink-700, #3e514d)', 500: 'var(--coinxp-ink-500, #596762)' },
        canvas: 'var(--coinxp-canvas, #f5f7f6)',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '1.25rem' },
    },
  },
  plugins: [],
} satisfies Config;
