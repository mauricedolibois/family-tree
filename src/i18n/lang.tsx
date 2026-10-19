// src/i18n/lang.tsx
//
// Sprache der App: Deutsch oder Englisch. Ohne eigene Wahl gilt die bevorzugte
// Sprache des Browsers (Accept-Language), sonst Englisch. Die Wahl steht in einem
// Cookie, damit schon die erste Seite vom Server in der richtigen Sprache kommt.
//
// Texte stehen direkt im Code in beiden Sprachen: t('Speichern', 'Save').

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'de' | 'en'

export const LANG_COOKIE = 'sprache'

const isLang = (v: unknown): v is Lang => v === 'de' || v === 'en'

/**
 * Bevorzugte Sprache aus „de-DE,de;q=0.9,en;q=0.8“: die erste (nach Gewicht),
 * die wir können. Ohne Angabe Deutsch, bei fremden Sprachen Englisch.
 */
export function langFromAcceptLanguage(header: string | undefined | null): Lang {
  if (!header) return 'de'
  const ranked = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(';')
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean)
      return { base: tag.split('-')[0], q: q === undefined ? 1 : Number(q), i }
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  const hit = ranked.find((x) => isLang(x.base))
  return hit ? (hit.base as Lang) : 'en'
}

/** Gewählte Sprache aus dem Cookie, sonst die des Browsers */
export function langFromRequest(req: { headers: Record<string, string | string[] | undefined> }): Lang {
  const cookie = String(req.headers.cookie ?? '')
  const chosen = new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=(de|en)(?:;|$)`).exec(cookie)?.[1]
  if (isLang(chosen)) return chosen
  const accept = req.headers['accept-language']
  return langFromAcceptLanguage(Array.isArray(accept) ? accept[0] : accept)
}

type LangState = { lang: Lang; setLang: (lang: Lang) => void }

const LangContext = createContext<LangState>({ lang: 'de', setLang: () => {} })

export function LanguageProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)

  // Seitenwechsel bringen eine neue Vorgabe vom Server mit
  useEffect(() => setLangState(initial), [initial])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

/** Sprache, Umschalter und t(deutsch, englisch) */
export function useLang() {
  const { lang, setLang } = useContext(LangContext)
  const t = useCallback((de: string, en: string) => (lang === 'en' ? en : de), [lang])
  return { lang, setLang, t }
}

/** Für Code außerhalb von React: t(lang)('Speichern', 'Save') */
export const tr =
  (lang: Lang) =>
  (de: string, en: string): string =>
    lang === 'en' ? en : de

/** Für Intl-Formate */
export const locale = (lang: Lang) => (lang === 'en' ? 'en-US' : 'de-DE')
