// src/themes/ThemeProvider.tsx
// Current theme and mode for every component. The server already rendered the page
// in them (attributes on <html>); changing them here switches the attributes at
// once and stores the choice in cookies for the next request.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  BAR_COLOR,
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_COOKIE,
  THEME_COOKIE,
  isMode,
  isTheme,
  type Mode,
  type ThemeId,
} from './themes'

type ThemeCtx = {
  theme: ThemeId
  mode: Mode
  /** Light or dark right now, with "system" resolved */
  dark: boolean
  setTheme: (theme: ThemeId) => void
  setMode: (mode: Mode) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

const ONE_YEAR = 60 * 60 * 24 * 365
const store = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`
}

/** Before themes there was only a dark switch, remembered in localStorage */
const LEGACY_KEY = 'stammbaum:licht'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME)
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE)
  const [systemDark, setSystemDark] = useState(false)
  // Until the server's choice is read, nothing may be written back to <html>
  const [ready, setReady] = useState(false)

  // Start from what the server rendered
  useEffect(() => {
    const root = document.documentElement
    if (isTheme(root.dataset.theme)) setThemeState(root.dataset.theme)
    let initial = isMode(root.dataset.mode) ? root.dataset.mode : DEFAULT_MODE
    try {
      if (!document.cookie.includes(`${MODE_COOKIE}=`) && localStorage.getItem(LEGACY_KEY) === 'night') initial = 'dark'
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* storage unavailable: ignore */
    }
    setModeState(initial)
    setReady(true)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(media.matches)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const dark = mode === 'dark' || (mode === 'system' && systemDark)

  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.mode = mode
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = BAR_COLOR[theme][dark ? 'dark' : 'light']
    document.head.appendChild(meta)
  }, [ready, theme, mode, dark])

  const setTheme = useCallback((next: ThemeId) => {
    store(THEME_COOKIE, next)
    setThemeState(next)
  }, [])
  const setMode = useCallback((next: Mode) => {
    store(MODE_COOKIE, next)
    setModeState(next)
  }, [])

  const value = useMemo(() => ({ theme, mode, dark, setTheme, setMode }), [theme, mode, dark, setTheme, setMode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
