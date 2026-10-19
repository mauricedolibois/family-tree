/**
 * @jest-environment node
 */
import { daysText, upcomingBirthdays } from '@/family/birthdays'
import { birthdayCalendar } from '@/family/ical'
import { calendarQuery, calendarSubset, parseCalendarQuery } from '@/family/calendarLink'
import type { Tree } from '@/family/model'

function tree(people: Array<[name: string, birthDate: string | null, deathDate?: string | null]>): Tree {
  const members: Tree['members'] = {}
  for (const [name, birthDate, deathDate] of people) {
    members[name] = {
      id: name,
      name,
      gender: 'FEMALE',
      spouseId: null,
      parentIds: [],
      childrenIds: [],
      adoptedChildrenIds: [],
      profile: { birthDate, deathDate: deathDate ?? null, media: [] },
    }
  }
  return { version: 3, rootId: people[0][0], members }
}

const today = new Date(2026, 9, 18, 14, 30) // 2026-10-18, afternoon

describe('upcoming birthdays', () => {
  const t = tree([
    ['Heute', '1970-10-18'],
    ['Morgen', '2002-10-19'],
    ['Gestern', '1990-10-17'],
    ['Silvester', '1999-12-31'],
    ['Nur Jahr', '1950'],
    ['Nur Monat', '1950-03'],
    ['Verstorben', '1940-11-01', '2010-05-05'],
    ['Uralt ohne Sterbedatum', '1888-10-20'],
  ])
  const list = upcomingBirthdays(t, today)
  const names = list.map((b) => b.person.name)

  it('sorts by days until the birthday, wrapping into next year', () => {
    expect(names).toEqual(['Heute', 'Morgen', 'Silvester', 'Gestern'])
  })

  it('days and age', () => {
    const [heute, morgen, silvester, gestern] = list
    expect([heute.days, heute.age]).toEqual([0, 56])
    expect([morgen.days, morgen.age]).toEqual([1, 24])
    expect([silvester.days, silvester.age]).toEqual([74, 27])
    expect([gestern.days, gestern.age, gestern.date.getFullYear()]).toEqual([364, 37, 2027])
  })

  it('leaves out incomplete dates, the deceased and the very old without a date of death', () => {
    expect(names).not.toContain('Nur Jahr')
    expect(names).not.toContain('Nur Monat')
    expect(names).not.toContain('Verstorben')
    expect(names).not.toContain('Uralt ohne Sterbedatum')
  })

  it('29 February falls on the 28th in non-leap years', () => {
    const [b] = upcomingBirthdays(tree([['Schalttag', '2004-02-29']]), today)
    expect([b.date.getFullYear(), b.date.getMonth() + 1, b.date.getDate()]).toEqual([2027, 2, 28])
    const [c] = upcomingBirthdays(tree([['Schalttag', '2004-02-29']]), new Date(2027, 11, 1))
    expect([c.date.getFullYear(), c.date.getMonth() + 1, c.date.getDate()]).toEqual([2028, 2, 29])
  })

  it('in words', () => {
    expect([0, 1, 5].map((d) => daysText(d))).toEqual(['heute', 'morgen', 'in 5 Tagen'])
  })
})

describe('calendar subscription', () => {
  const t = tree([
    ['Frank Beispiel', '1970-11-27'],
    ['Komma, Semikolon; Name', '1990-01-02'],
    ['Nur Jahr', '1950'],
  ])
  const ics = birthdayCalendar(t, { calendarName: 'Geburtstage Familie Test', now: today })
  const unfolded = ics.replace(/\r\n /g, '')

  it('is a valid calendar with CRLF lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(unfolded).toContain('X-WR-CALNAME:Geburtstage Familie Test')
  })

  it('two all-day events per person with the age in the title', () => {
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(4)
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261127')
    expect(unfolded).toContain('DTEND;VALUE=DATE:20261128')
    expect(unfolded).toContain('SUMMARY:🎂 Frank Beispiel (56)')
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20271127')
    expect(unfolded).toContain('SUMMARY:🎂 Frank Beispiel (57)')
    expect(unfolded).toContain('UID:Frank Beispiel-2026@stammbaum')
    expect(unfolded).toContain('TRIGGER:PT9H')
  })

  it('escapes special characters and skips incomplete dates', () => {
    expect(unfolded).toContain('SUMMARY:🎂 Komma\\, Semikolon; Name (37)')
    expect(unfolded).not.toContain('Nur Jahr')
  })
})

describe('subscription for one line only', () => {
  // Grandma ─ Mum ─ Me ─ Child; Mum's sister (aunt) with a cousin
  const t = tree([
    ['Oma', '1940-01-01'],
    ['Mama', '1965-02-02'],
    ['Tante', '1968-03-03'],
    ['Ich', '1990-04-04'],
    ['Cousine', '1995-05-05'],
    ['Kind', '2020-06-06'],
  ])
  const link = (parent: string, child: string) => {
    t.members[parent].childrenIds.push(child)
    t.members[child].parentIds!.push(parent)
  }
  link('Oma', 'Mama')
  link('Oma', 'Tante')
  link('Mama', 'Ich')
  link('Tante', 'Cousine')
  link('Ich', 'Kind')

  const names = (q: string) => {
    const params = Object.fromEntries(new URLSearchParams(q))
    return Object.keys(calendarSubset(t, parseCalendarQuery(params)).tree.members).sort()
  }

  it('person and scope are readable in the link', () => {
    expect(calendarQuery({ personId: 'Ich', scope: { up: 1, down: null, side: 2 } })).toBe(
      '?linie=Ich&vorfahren=1&nachkommen=alle&seiten=cousins',
    )
    expect(calendarQuery(null)).toBe('')
  })

  it('selects the line within the requested scope', () => {
    expect(names('')).toHaveLength(6)
    expect(names('linie=Ich')).toEqual(['Ich', 'Kind', 'Mama', 'Oma'])
    expect(names('linie=Ich&vorfahren=1&nachkommen=0')).toEqual(['Ich', 'Mama'])
    expect(names('linie=Ich&seiten=geschwister')).toEqual(['Ich', 'Kind', 'Mama', 'Oma', 'Tante'])
    expect(names('linie=Ich&seiten=cousins')).toEqual(['Cousine', 'Ich', 'Kind', 'Mama', 'Oma', 'Tante'])
    expect(names('linie=Ich&seiten=2&vorfahren=unsinn')).toEqual(names('linie=Ich&seiten=cousins'))
  })

  it('unknown person: empty calendar instead of the whole family', () => {
    expect(names('linie=gibtsnicht')).toEqual([])
    const sub = calendarSubset(t, { personId: 'Ich', scope: { up: null, down: null, side: 0 } })
    expect(sub.personName).toBe('Ich')
    expect(birthdayCalendar(sub.tree, { calendarName: 'x', now: today }).match(/BEGIN:VEVENT/g)).toHaveLength(8)
  })
})
