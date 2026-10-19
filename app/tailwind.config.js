/** @type {import('tailwindcss').Config} */

// Style-System „Pergament & Tinte“: Alle Farben kommen aus CSS-Variablen in
// src/styles/tokens.css. Hier werden sie nur unter sprechenden Namen
// für Tailwind verfügbar gemacht (z. B. bg-linen, text-ink-muted).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  content: ['./src/pages/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        linen: { DEFAULT: v('linen'), hover: v('linen-hover'), deep: v('linen-deep'), tint: v('linen-tint') },
        paper: { DEFAULT: v('paper'), raised: v('paper-raised') },
        card: { DEFAULT: v('card'), edge: v('card-edge'), rule: v('card-rule'), past: v('card-past') },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), faint: v('ink-faint') },
        line: v('line'),
        gilt: { DEFAULT: v('gilt'), light: v('gilt-light'), soft: v('gilt-soft'), deep: v('gilt-deep') },
        portrait: v('portrait'),
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
      },
      fontFamily: {
        // Titel und Überschriften: alte Buchdruck-Schrift
        display: ['"IM Fell English"', '"EB Garamond Variable"', 'Georgia', 'serif'],
        // Namen: klassische Garamond
        serif: ['"EB Garamond Variable"', 'Georgia', 'serif'],
        // Bedienung und Daten: besonders gut lesbar
        sans: ['"Atkinson Hyperlegible Next"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Typo-Skala (Verhältnis ~1.2), Zeilenhöhen passend
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.2rem', { lineHeight: '1.65rem' }],
        xl: ['1.44rem', { lineHeight: '1.9rem' }],
        '2xl': ['1.728rem', { lineHeight: '2.2rem' }],
        '3xl': ['2.074rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        card: '12px',
        panel: '20px',
        control: '10px',
      },
      boxShadow: {
        card: '0 1px 0 rgb(var(--linen) / 0.05), 0 3px 10px -6px rgb(var(--linen) / 0.35)',
        lifted: '0 2px 0 rgb(var(--linen) / 0.04), 0 12px 32px -12px rgb(var(--linen-deep) / 0.45)',
        sheet: '0 -8px 32px -16px rgb(var(--linen-deep) / 0.5)',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
