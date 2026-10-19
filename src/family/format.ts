// src/family/format.ts
// Namen und Daten so aufbereiten, wie man sie im Stammbaum lesen möchte.

import type { LineScope, Person } from './model'
import { locale, type Lang } from '@/i18n/lang'

/** „Karl Friedrich Mustermann“ → Vornamen „Karl Friedrich“, Nachname „Mustermann“ */
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

/** Verstorben – mit Sterbedatum oder als „verstorben, Datum unbekannt“ eingetragen */
export const isDeceased = (p: Person) => !!p.profile?.deathDate || p.profile?.deceased === true

/**
 * „1919–1989“, „* 1944“, „† 1944“, ohne bekanntes Sterbejahr „1888–†“ bzw. „†“, oder leer.
 * Englisch: „b. 1944“, „d. 1944“.
 */
export function lifeYears(p: Person, lang: Lang = 'de'): string {
  const b = yearOf(p.profile?.birthDate)
  const d = yearOf(p.profile?.deathDate)
  const en = lang === 'en'
  if (b && d) return b === d ? (en ? `${b}–${d}` : `* † ${b}`) : `${b}–${d}`
  if (d) return en ? `d. ${d}` : `† ${d}`
  if (isDeceased(p)) return b ? `${b}–†` : '†'
  if (b) return en ? `b. ${b}` : `* ${b}`
  return ''
}

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

type DateParts = { year: number; month?: number; day?: number }

function partsOf(iso?: string | null): DateParts | null {
  const m = iso ? /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(iso) : null
  if (!m) return null
  return { year: +m[1], month: m[2] ? +m[2] : undefined, day: m[3] ? +m[3] : undefined }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Gespeichertes Datum zum Lesen: „25.12.1944“, „Mai 1778“ oder „1778“; englisch „Dec 25, 1944“, „May 1778“ */
export function formatDate(iso?: string | null, lang: Lang = 'de'): string {
  const d = partsOf(iso)
  if (!d) return iso ?? ''
  if (lang === 'en' && d.month) {
    const date = new Date(Date.UTC(d.year, d.month - 1, d.day ?? 1))
    const opts: Intl.DateTimeFormatOptions = d.day
      ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
      : { month: 'long', year: 'numeric', timeZone: 'UTC' }
    return new Intl.DateTimeFormat(locale(lang), opts).format(date)
  }
  if (d.day && d.month) return `${pad(d.day)}.${pad(d.month)}.${d.year}`
  if (d.month) return `${MONTHS[d.month - 1]} ${d.year}`
  return String(d.year)
}

/** Gespeichertes Datum zum Bearbeiten: „25.12.1944“, „05.1778“ oder „1778“; englisch „12/25/1944“, „05/1778“ */
export function toDateInput(iso?: string | null, lang: Lang = 'de'): string {
  const d = partsOf(iso)
  if (!d) return iso ?? ''
  const en = lang === 'en'
  if (d.day && d.month)
    return en ? `${pad(d.month)}/${pad(d.day)}/${d.year}` : `${pad(d.day)}.${pad(d.month)}.${d.year}`
  if (d.month) return en ? `${pad(d.month)}/${d.year}` : `${pad(d.month)}.${d.year}`
  return String(d.year)
}

/**
 * Eingabe „25.12.1944“, „5.3.1910“, „12.1944“, „1944“ oder „1944-12-25“ → gespeichertes Format.
 * Mit Schrägstrichen amerikanisch: „12/25/1944“, „12/1944“.
 * Leer → null. Ungültig → undefined.
 */
export function parseDateInput(text: string): string | null | undefined {
  const t = text.trim()
  if (!t) return null
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t)
  if (m) return validParts(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})\.(\d{4})$/.exec(t)
  if (m) return validParts(+m[2], +m[1])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return validParts(+m[3], +m[1], +m[2])
  m = /^(\d{1,2})\/(\d{4})$/.exec(t)
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

/** Alter in Jahren (bis heute oder bis zum Tod); ungefähr, wenn nur Jahre bekannt sind */
export function ageOf(p: Person, now = new Date()): { years: number; approx: boolean } | null {
  const b = partsOf(p.profile?.birthDate)
  if (!b) return null
  const deathRaw = p.profile?.deathDate
  if (!deathRaw && isDeceased(p)) return null // Sterbedatum unbekannt
  const d: DateParts | null = deathRaw
    ? partsOf(deathRaw)
    : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  if (!d) return null
  let years = d.year - b.year
  const exact = !!(b.month && b.day && d.month && d.day)
  if (exact && (d.month! < b.month! || (d.month === b.month && d.day! < b.day!))) years--
  return years >= 0 && years < 130 ? { years, approx: !exact } : null
}

/** Für die Suche: Groß/Klein und Akzente egal */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
}

/** „keine“, „1 Generation“, „3 Generationen“ (englisch „none“, „1 generation“, „3 generations“) */
export function generations(n: number, lang: Lang = 'de'): string {
  if (lang === 'en') return n <= 0 ? 'none' : n === 1 ? '1 generation' : `${n} generations`
  if (n <= 0) return 'keine'
  return n === 1 ? '1 Generation' : `${n} Generationen`
}

/** „alle 4 Generationen“ */
export function allGenerations(n: number, lang: Lang = 'de'): string {
  return lang === 'en' ? `all ${generations(n, lang)}` : `alle ${generations(n, lang)}`
}

const SIDE_TEXT: Record<Lang, Record<LineScope['side'], string>> = {
  de: {
    0: 'ohne Seitenlinien',
    1: 'mit Geschwistern',
    2: 'mit Geschwistern und deren Kindern',
    3: 'mit allen Blutsverwandten',
  },
  en: {
    0: 'no side branches',
    1: 'with siblings',
    2: 'with siblings and their children',
    3: 'with all blood relatives',
  },
}

/** Umfang einer Linie in Worten: „Vorfahren: alle 9 Generationen, Nachkommen: keine, ohne Seitenlinien“ */
export function describeLineScope(scope: LineScope, depth: { up: number; down: number }, lang: Lang = 'de'): string {
  const part = (v: number | null, max: number) =>
    max === 0 ? generations(0, lang) : v === null || v >= max ? allGenerations(max, lang) : generations(v, lang)
  const [up, down] = lang === 'en' ? ['Ancestors', 'Descendants'] : ['Vorfahren', 'Nachkommen']
  return `${up}: ${part(scope.up, depth.up)}, ${down}: ${part(scope.down, depth.down)}, ${SIDE_TEXT[lang][scope.side]}`
}
