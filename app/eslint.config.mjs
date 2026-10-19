// ESLint 9 flat config with the rules of the former .eslintrc.json:
// Next.js recommendations plus Prettier (Prettier checks formatting, not ESLint).
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'coverage/**', '.npm/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'prettier'),
]

export default config
