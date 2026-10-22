// ESLint 9 flat config: Next.js recommendations (core web vitals) plus Prettier
// (Prettier checks formatting, not ESLint).
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'coverage/**', '.npm/**', 'next-env.d.ts'] },
  ...nextVitals,
  prettier,
  {
    rules: {
      // Rules for the React Compiler, which this app does not use. They flag patterns
      // used on purpose: state read from cookies and localStorage after hydration,
      // loading data when a page opens, and refs that keep the latest callback.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      // Signing in or out, losing access and downloads deliberately load the page
      // anew, so no state of the previous session survives
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
]

export default config
