// src/family/birthdays.ts
// Wer hat als Nächstes Geburtstag? Nur Lebende mit vollständigem Geburtsdatum.

import type { Person, Tree } from './model'

export type Birthday = {
  person: Person
  /** Datum des nächsten Geburtstags (Ortszeit, 0 Uhr) */
  date: Date
  /** Tage bis dahin: 0 = heute */
  days: number
  /** So alt wird die Person */
  age: number
}

/** Ohne eingetragenes Sterbedatum, aber älter als das: vermutlich verstorben */
const MAX_AGE = 105
const DAY = 86_400_000

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Geburtstag in einem Jahr; der 29. Februar fällt in Nicht-Schaltjahren auf den 28. */
function birthdayIn(year: number, month: number, day: number): Date {
  const d = new Date(year, month - 1, day)
  return d.getMonth() === month - 1 ? d : new Date(year, month - 1, 28)
}

export function upcomingBirthdays(tree: Tree, now = new Date()): Birthday[] {
  const today = midnight(now)
  const out: Birthday[] = []
  for (const person of Object.values(tree.members)) {
    if (person.profile?.deathDate) continue
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.profile?.birthDate ?? '')
    if (!m) continue
    const [year, month, day] = [+m[1], +m[2], +m[3]]
    let date = birthdayIn(today.getFullYear(), month, day)
    if (date < today) date = birthdayIn(today.getFullYear() + 1, month, day)
    const age = date.getFullYear() - year
    if (age <= 0 || age > MAX_AGE) continue
    out.push({ person, date, days: Math.round((date.getTime() - today.getTime()) / DAY), age })
  }
  return out.sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name, 'de'))
}

/** „heute“, „morgen“, „in 5 Tagen“ */
export function daysText(days: number): string {
  if (days === 0) return 'heute'
  if (days === 1) return 'morgen'
  return `in ${days} Tagen`
}
