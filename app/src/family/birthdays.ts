// src/family/birthdays.ts
// Whose birthday is next? Only living people with a complete date of birth.

import type { Person, Tree } from './model'
import { isDeceased } from './format'

export type Birthday = {
  person: Person
  /** Date of the next birthday (local time, midnight) */
  date: Date
  /** Days until then: 0 = today */
  days: number
  /** Age the person turns */
  age: number
}

/** No date of death recorded but older than this: most likely deceased */
const MAX_AGE = 105
const DAY = 86_400_000

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Birthday in a given year; 29 February falls on the 28th in non-leap years */
function birthdayIn(year: number, month: number, day: number): Date {
  const d = new Date(year, month - 1, day)
  return d.getMonth() === month - 1 ? d : new Date(year, month - 1, 28)
}

/**
 * Upcoming birthdays, sorted. With `occurrences` > 1 the following years too
 * (the calendar uses this one and the next).
 */
export function upcomingBirthdays(tree: Tree, now = new Date(), occurrences = 1): Birthday[] {
  const today = midnight(now)
  const out: Birthday[] = []
  for (const person of Object.values(tree.members)) {
    if (isDeceased(person)) continue
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.profile?.birthDate ?? '')
    if (!m) continue
    const [year, month, day] = [+m[1], +m[2], +m[3]]
    let next = today.getFullYear()
    if (birthdayIn(next, month, day) < today) next++
    for (let i = 0; i < occurrences; i++) {
      const date = birthdayIn(next + i, month, day)
      const age = date.getFullYear() - year
      if (age <= 0 || age > MAX_AGE) continue
      out.push({ person, date, days: Math.round((date.getTime() - today.getTime()) / DAY), age })
    }
  }
  return out.sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name, 'de'))
}

/** "heute", "morgen", "in 5 Tagen" */
export function daysText(days: number): string {
  if (days === 0) return 'heute'
  if (days === 1) return 'morgen'
  return `in ${days} Tagen`
}
