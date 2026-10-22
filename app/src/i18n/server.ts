// src/i18n/server.ts
// Language of a request: the visitor's explicit choice (cookie) wins, then the
// browser's Accept-Language, then German.

import type { IncomingMessage } from 'http'
import { parseCookie } from 'cookie'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, parseAcceptLanguage, type Locale } from './locales'

export function localeFromRequest(req: Pick<IncomingMessage, 'headers'>): Locale {
  const chosen = req.headers.cookie ? parseCookie(req.headers.cookie)[LOCALE_COOKIE] : undefined
  if (isLocale(chosen)) return chosen
  return matchLocale(parseAcceptLanguage(req.headers['accept-language'])) ?? DEFAULT_LOCALE
}
