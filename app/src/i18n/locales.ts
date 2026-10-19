// src/i18n/locales.ts
// Supported languages and how a visitor's language is picked.

export const LOCALES = ['de', 'en', 'fr', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'de'
export const LOCALE_COOKIE = 'lang'

/** Names in their own language, for the language switcher */
export const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
}

/**
 * BCP 47 tags for Intl. English uses British conventions so dates read
 * day-first like in the other three languages (25/12/1944, not 12/25/1944).
 */
export const INTL_TAG: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
}

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale)

/** First supported language in a list of preferences such as navigator.languages */
export function matchLocale(preferences: readonly string[]): Locale | null {
  for (const pref of preferences) {
    const base = pref.trim().toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return null
}

/** Language ranges of an Accept-Language header, highest quality first */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((part, index) => {
      const [range, ...params] = part.trim().split(';')
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean)
      return { range, q: q === undefined ? 1 : Number(q), index }
    })
    .filter((r) => r.range && r.range !== '*' && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((r) => r.range)
}
