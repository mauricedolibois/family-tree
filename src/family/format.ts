// src/family/format.ts
// Namen und Daten so aufbereiten, wie man sie im Stammbaum lesen möchte.

import type { Person } from './model'

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

/** „1919–1989“, „* 1944“, „† 1944“ oder leer */
export function lifeYears(p: Person): string {
  const b = yearOf(p.profile?.birthDate)
  const d = yearOf(p.profile?.deathDate)
  if (b && d) return b === d ? `* † ${b}` : `${b}–${d}`
  if (b) return `* ${b}`
  if (d) return `† ${d}`
  return ''
}

export const isDeceased = (p: Person) => !!p.profile?.deathDate

/** ISO-Datum → „25.12.1944“ */
export function formatDate(iso?: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/** Alter in Jahren (bis heute oder bis zum Tod) */
export function ageInYears(p: Person, now = new Date()): number | null {
  const b = p.profile?.birthDate
  if (!b) return null
  const birth = new Date(b)
  const end = p.profile?.deathDate ? new Date(p.profile.deathDate) : now
  let age = end.getFullYear() - birth.getFullYear()
  const m = end.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

/** Für die Suche: Groß/Klein und Akzente egal */
export function normalizeForSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
}
