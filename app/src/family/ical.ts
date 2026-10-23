// src/family/ical.ts
//
// Birthdays as a calendar subscription (iCalendar, RFC 5545). Each birthday is an
// all-day event with the age in its title. To keep the age right, the next two
// occurrences are listed individually; the subscription refreshes itself.

import { upcomingBirthdays } from './birthdays'
import type { Tree } from './model'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import { MESSAGES } from '@/i18n/messages'

const CRLF = '\r\n'

/** Escape text in iCalendar values */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, ';').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** UTF-8 byte length of a character */
function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
}

/** Fold lines after 75 bytes (continuation lines start with a space) without splitting characters */
function fold(line: string): string {
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = utf8Length(ch)
    const limit = out.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  out.push(current)
  return out.join(`${CRLF} `)
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateValue = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes(),
  )}${pad(d.getUTCSeconds())}Z`

export function birthdayCalendar(
  tree: Tree,
  {
    calendarName,
    now = new Date(),
    occurrences = 2,
    locale = DEFAULT_LOCALE,
  }: { calendarName: string; now?: Date; occurrences?: number; locale?: Locale },
): string {
  const t = MESSAGES[locale].calendar
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stammbaum//Geburtstage//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    // Ask calendar apps to refresh regularly
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]
  for (const b of upcomingBirthdays(tree, now, occurrences)) {
    const end = new Date(b.date.getFullYear(), b.date.getMonth(), b.date.getDate() + 1)
    const name = b.person.name
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.person.id}-${b.date.getFullYear()}@stammbaum`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(b.date)}`,
      `DTEND;VALUE=DATE:${dateValue(end)}`,
      `SUMMARY:${escapeText(`🎂 ${name} (${b.age})`)}`,
      `DESCRIPTION:${escapeText(t.turns(name, b.age))}`,
      'TRANSP:TRANSPARENT',
      // Reminder at 9 a.m. on the birthday
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(t.birthdayToday(name, b.age))}`,
      'TRIGGER:PT9H',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join(CRLF) + CRLF
}
