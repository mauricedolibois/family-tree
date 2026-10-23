/** @type {import('tailwindcss').Config} */

// Exposes the theme to Tailwind under role names (bg-primary, text-ink-muted,
// font-display, rounded-card). The values come from CSS variables that every theme
// in src/styles/themes/ sets, so switching the theme switches the whole interface
// (see docs/themes.md).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  content: ['./src/pages/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v('primary'), hover: v('primary-hover'), deep: v('primary-deep'), tint: v('primary-tint') },
        // Text and icons on a coloured background, and links
        'on-primary': { DEFAULT: v('on-primary'), accent: v('on-primary-accent') },
        'on-accent': v('on-accent'),
        'on-tint': v('on-tint'),
        'on-portrait': v('on-portrait'),
        link: v('link'),
        canvas: { DEFAULT: v('canvas'), raised: v('canvas-raised') },
        card: { DEFAULT: v('card'), edge: v('card-edge'), rule: v('card-rule'), past: v('card-past') },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), faint: v('ink-faint') },
        line: v('line'),
        // Decorative borders around cards, panels and frames
        frame: v('frame'),
        accent: { DEFAULT: v('accent'), light: v('accent-light'), soft: v('accent-soft'), deep: v('accent-deep') },
        portrait: v('portrait'),
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
      },
      fontFamily: {
        // Titles and headings
        display: 'var(--font-display)',
        // Names and longer text
        text: 'var(--font-text)',
        // Controls and data; also the default for everything else
        sans: 'var(--font-ui)',
      },
      fontSize: {
        // Type scale (ratio ~1.2) with matching line heights
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.2rem', { lineHeight: '1.65rem' }],
        xl: ['1.44rem', { lineHeight: '1.9rem' }],
        '2xl': ['1.728rem', { lineHeight: '2.2rem' }],
        '3xl': ['2.074rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        control: 'var(--radius-control)',
      },
      boxShadow: {
        card: '0 1px 0 rgb(var(--shadow) / 0.05), 0 3px 10px -6px rgb(var(--shadow) / 0.35)',
        lifted: '0 2px 0 rgb(var(--shadow) / 0.04), 0 12px 32px -12px rgb(var(--shadow-strong) / 0.45)',
        sheet: '0 -8px 32px -16px rgb(var(--shadow-strong) / 0.5)',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
