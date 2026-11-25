/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        sunken: v('sunken'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        accent: v('accent'),
        'accent-ink': v('accent-ink'),
        gold: v('gold'),
        rose: v('rose'),
        ok: v('ok'),
        warn: v('warn'),
        bad: v('bad'),
      },
      fontFamily: {
        serif: ['"Fraunces Variable"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)',
        lift: '0 2px 4px rgb(0 0 0 / 0.06), 0 18px 40px -16px rgb(0 0 0 / 0.25)',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.3)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        rise: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: {
        pop: 'pop .35s ease-out',
        shimmer: 'shimmer 1.4s linear infinite',
        rise: 'rise .25s ease-out both',
      },
    },
  },
  plugins: [],
};
