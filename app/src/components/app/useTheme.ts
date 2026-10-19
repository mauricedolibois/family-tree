// src/components/app/useTheme.ts
// Tageslicht oder Kerzenlicht – wird pro Gerät gemerkt.

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'day' | 'night'
export const THEME_KEY = 'stammbaum:licht'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('day')

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'night' ? 'night' : 'day')
  }, [])

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'night' ? 'day' : 'night'
      document.documentElement.dataset.theme = next
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', next === 'night' ? '#121F18' : '#1E3428')
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        /* egal */
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
