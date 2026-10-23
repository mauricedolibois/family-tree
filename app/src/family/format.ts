// src/family/format.ts
// Names and dates prepared the way people expect to read them in a family tree.

import type { LineScope, Person } from './model'
import { DEFAULT_LOCALE, INTL_TAG, type Locale } from '@/i18n/locales'
import { MESSAGES } from '@/i18n/messages'

/** "Karl Friedrich Mustermann" → given names "Karl Friedrich", surname "Mustermann" */
export function splitName(name: string): { given: string; surname: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return { given: parts[0] ?? '', surname: '' }
  return { given: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] }
}

export function initials(name: string): string {
  const { given, surname } = splitName(name)
  return ((given[0] ?? '') + (surname[0] ?? '')).toUpperCase() || '?'
}

const yearOf = (iso?: string | null) => (iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : null)

/** Deceased, either with a date of death or flagged as "deceased, date unknown" */
export const isDeceased = (p: Person) => !!p.profile?.deathDate || p.profile?.deceased === true

/** "1919–1989", "* 1944", "† 1944"; without a known year of death "1888–†" or "†"; or empty */
export function lifeYears(p: Person): string {
  const b = yearOf(p.profile?.birthDate)
  const d = yearOf(p.profile?.deathDate)
  if (b && d) return b === d ? `* † ${b}` : `${b}–${d}`
  if (d) return `† ${d}`
  if (isDeceased(p)) return b ? `${b}–†` : '†'
  if (b) return `* ${b}`
  return ''
}

type DateParts = { year: number; month?: number; day?: number }

function partsOf(iso?: string | null): DateParts | null {
  const m = iso ? /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(iso) : null
  if (!m) return null
  return { year: +m[1], month: m[2] ? +m[2] : undefined, day: m[3] ? +m[3] : undefined }
}

/** A calendar date at UTC midnight; also works for years before 100 */
function utcDate(year: number, month: number, day: number): Date {
  const d = new Date(Date.UTC(2000, month - 1, day))
  d.setUTCFullYear(year)
  return d
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options)
  let f = formatters.get(key)
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(INTL_TAG[locale], { ...options, timeZone: 'UTC' })))
  return f
}

/** Stored date for display: "25.12.1944", "Mai 1778" or "1778" (in German) */
export function formatDate(iso?: string | null, locale: Locale = DEFAULT_LOCALE): string {
  const d = partsOf(iso)
  if (!d) return iso ?? ''
  if (d.day && d.month) {
    return dateFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      utcDate(d.year, d.month, d.day),
    )
  }
  if (d.month) return dateFormat(locale, { month: 'long', year: 'numeric' }).format(utcDate(d.year, d.month, 1))
  return String(d.year)
}

/** Separator in typed dates: 25.12.1944 in German, 25/12/1944 elsewhere */
const dateSeparator = (locale: Locale) => (locale === 'de' ? '.' : '/')

/** Stored date for the edit field: "25.12.1944", "05.1778" or "1778" (in German) */
export function toDateInput(iso?: string | null, locale: Locale = DEFAULT_LOCALE): string {
  const d = partsOf(iso)
  if (!d) return iso ?? ''
  const sep = dateSeparator(locale)
  const two = (n: number) => String(n).padStart(2, '0')
  if (d.day && d.month) return `${two(d.day)}${sep}${two(d.month)}${sep}${d.year}`
  if (d.month) return `${two(d.month)}${sep}${d.year}`
  return String(d.year)
}

/**
 * Input "25.12.1944", "25/12/1944", "5.3.1910", "12.1944", "1944" or "1944-12-25"
 * → stored format. Day always comes first. Empty → null. Invalid → undefined.
 */
export function parseDateInput(text: string): string | null | undefined {
  const t = text.trim()
  if (!t) return null
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t)
  if (m) return validParts(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})[./](\d{4})$/.exec(t)
  if (m) return validParts(+m[2], +m[1])
  m = /^(\d{4})$/.exec(t)
  if (m) return validParts(+m[1])
  m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t)
  if (m) return validParts(+m[1], +m[2], m[3] ? +m[3] : undefined)
  return undefined
}

function validParts(year: number, month?: number, day?: number): string | undefined {
  if (year < 1000 || year > 2200) return undefined
  if (month === undefined) return String(year)
  if (month < 1 || month > 12) return undefined
  const mm = String(month).padStart(2, '0')
  if (day === undefined) return `${year}-${mm}`
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > daysInMonth) return undefined
  return `${year}-${mm}-${String(day).padStart(2, '0')}`
}

/** Age in years (until today or until death); approximate when only years are known */
export function ageOf(p: Person, now = new Date()): { years: number; approx: boolean } | null {
  const b = partsOf(p.profile?.birthDate)
  if (!b) return null
  const deathRaw = p.profile?.deathDate
  if (!deathRaw && isDeceased(p)) return null // date of death unknown
  const d: DateParts | null = deathRaw
    ? partsOf(deathRaw)
    : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  if (!d) return null
  let years = d.year - b.year
  const exact = !!(b.month && b.day && d.month && d.day)
  if (exact && (d.month! < b.month! || (d.month === b.month && d.day! < b.day!))) years--
  return years >= 0 && years < 130 ? { years, approx: !exact } : null
}

/** For search: ignore case and accents */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
}

/** "keine", "1 Generation", "3 Generationen" (in German) */
export function generations(n: number, locale: Locale = DEFAULT_LOCALE): string {
  return MESSAGES[locale].format.generations(n)
}

/** Line scope in words: "Vorfahren: alle 9 Generationen, Nachkommen: keine, ohne Seitenlinien" */
export function describeLineScope(
  scope: LineScope,
  depth: { up: number; down: number },
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = MESSAGES[locale].format
  const part = (v: number | null, max: number) =>
    max === 0 ? t.generations(0) : v === null || v >= max ? t.allGenerations(t.generations(max)) : t.generations(v)
  return t.scope(part(scope.up, depth.up), part(scope.down, depth.down), t.side[scope.side])
}
