// src/family/ical.ts
//
// Die Geburtstage als Kalender-Abo (iCalendar, RFC 5545). Jede Feier ist ein
// ganztägiger Termin mit Alter im Titel; damit das Alter stimmt, stehen die
// nächsten zwei Male einzeln drin – das Abo rückt von selbst nach.

import type { Lang } from '@/i18n/lang'
import { upcomingBirthdays } from './birthdays'
import type { Tree } from './model'

const CRLF = '\r\n'

/** Text in iCalendar-Werten maskieren */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, ';').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Bytes eines Zeichens in UTF-8 */
function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
}

/** Zeilen nach 75 Bytes umbrechen (Folgezeilen beginnen mit Leerzeichen), ohne Zeichen zu zerteilen */
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
    lang = 'de',
  }: { calendarName: string; now?: Date; occurrences?: number; lang?: Lang },
): string {
  const en = lang === 'en'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stammbaum//Geburtstage//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    // Bitte an die Kalender-Apps, regelmäßig nachzusehen
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
      `DESCRIPTION:${escapeText(en ? `${name} turns ${b.age}.` : `${name} wird ${b.age}.`)}`,
      'TRANSP:TRANSPARENT',
      // Erinnerung am Morgen des Geburtstags um 9 Uhr
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(
        en ? `${name}’s birthday today (${b.age})` : `${name} hat heute Geburtstag (${b.age})`,
      )}`,
      'TRIGGER:PT9H',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join(CRLF) + CRLF
}
