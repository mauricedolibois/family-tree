// src/i18n/countries.ts
// Countries offered in the "country" field. Names come from Intl in the current
// language; the stored value stays free text, as typed or picked.

import { INTL_TAG, LOCALES, type Locale } from './locales'

/** ISO 3166 codes of the countries suggested first */
export const SUGGESTED_COUNTRIES = ['DE', 'FR', 'LU', 'US', 'AT', 'CH', 'NL', 'BE', 'IT', 'PL', 'ES'] as const

export function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([INTL_TAG[locale]], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Every known name of a country in all supported languages, lower case */
export function countryNames(code: string): string[] {
  return LOCALES.map((l) => countryName(code, l).toLowerCase())
}
