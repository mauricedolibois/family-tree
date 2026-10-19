// src/family/format.ts
// Names and dates prepared the way people expect to read them in a family tree.

import type { LineScope, Person } from './model'

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

/** Stored date for display: "25.12.1944", "Mai 1778" or "1778" */
export function formatDate(iso?: string | null): string {
  const d = partsOf(iso)
  if (!d) return iso ?? ''
  if (d.day && d.month) return `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.${d.year}`
  if (d.month) return `${MONTHS[d.month - 1]} ${d.year}`
  return String(d.year)
}

/** Stored date for the edit field: "25.12.1944", "05.1778" or "1778" */
export function toDateInput(iso?: string | null): string {
  const d = partsOf(iso)
  if (!d) return iso ?? ''
  if (d.day && d.month) return `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.${d.year}`
  if (d.month) return `${String(d.month).padStart(2, '0')}.${d.year}`
  return String(d.year)
}

/**
 * Input "25.12.1944", "5.3.1910", "12.1944", "1944" or "1944-12-25" → stored format.
 * Empty → null. Invalid → undefined.
 */
export function parseDateInput(text: string): string | null | undefined {
  const t = text.trim()
  if (!t) return null
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t)
  if (m) return validParts(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})\.(\d{4})$/.exec(t)
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

/** "keine", "1 Generation", "3 Generationen" */
export function generations(n: number): string {
  if (n <= 0) return 'keine'
  return n === 1 ? '1 Generation' : `${n} Generationen`
}

const SIDE_TEXT: Record<LineScope['side'], string> = {
  0: 'ohne Seitenlinien',
  1: 'mit Geschwistern',
  2: 'mit Geschwistern und deren Kindern',
  3: 'mit allen Blutsverwandten',
}

/** Line scope in words: "Vorfahren: alle 9 Generationen, Nachkommen: keine, ohne Seitenlinien" */
export function describeLineScope(scope: LineScope, depth: { up: number; down: number }): string {
  const part = (v: number | null, max: number) =>
    max === 0 ? 'keine' : v === null || v >= max ? `alle ${generations(max)}` : generations(v)
  return `Vorfahren: ${part(scope.up, depth.up)}, Nachkommen: ${part(scope.down, depth.down)}, ${SIDE_TEXT[scope.side]}`
}
