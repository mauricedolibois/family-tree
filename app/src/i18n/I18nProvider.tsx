// src/i18n/I18nProvider.tsx
// Current language and its texts for every component. The server picks the
// language for the first render (see ./server.ts); changing it here stores the
// choice in a cookie so the next request renders in the same language.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, type Locale } from './locales'
import { MESSAGES, type Messages } from './messages'

type I18n = {
  locale: Locale
  /** Texts of the current language */
  t: Messages
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18n | null>(null)

const ONE_YEAR = 60 * 60 * 24 * 365

function readCookie(): Locale | null {
  const match = new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`).exec(document.cookie)
  return match && isLocale(match[1]) ? match[1] : null
}

/** @param initial language chosen by the server; pages rendered without it detect it on the client */
export function I18nProvider({ initial, children }: { initial?: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? DEFAULT_LOCALE)

  useEffect(() => {
    if (initial) return
    const detected = readCookie() ?? matchLocale(navigator.languages ?? [navigator.language])
    if (detected) setLocaleState(detected)
  }, [initial])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`
    setLocaleState(next)
  }, [])

  const value = useMemo(() => ({ locale, t: MESSAGES[locale], setLocale }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
