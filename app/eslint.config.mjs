// ESLint 9 (Flat Config). Übernimmt die bisherigen Regeln aus .eslintrc.json:
// Next.js-Empfehlungen plus Prettier (Formatierung prüft Prettier, nicht ESLint).
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'prettier'),
]

export default config
