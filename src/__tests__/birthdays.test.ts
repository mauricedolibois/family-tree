import { daysText, upcomingBirthdays } from '@/family/birthdays'
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

const today = new Date(2026, 9, 18, 14, 30) // 18.10.2026, nachmittags

describe('Nächste Geburtstage', () => {
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

  it('sortiert nach Tagen bis zum Geburtstag, das Jahr läuft weiter', () => {
    expect(names).toEqual(['Heute', 'Morgen', 'Silvester', 'Gestern'])
  })

  it('Tage und Alter', () => {
    const [heute, morgen, silvester, gestern] = list
    expect([heute.days, heute.age]).toEqual([0, 56])
    expect([morgen.days, morgen.age]).toEqual([1, 24])
    expect([silvester.days, silvester.age]).toEqual([74, 27])
    expect([gestern.days, gestern.age, gestern.date.getFullYear()]).toEqual([364, 37, 2027])
  })

  it('ohne vollständiges Datum, Verstorbene und sehr Alte ohne Sterbedatum fehlen', () => {
    expect(names).not.toContain('Nur Jahr')
    expect(names).not.toContain('Nur Monat')
    expect(names).not.toContain('Verstorben')
    expect(names).not.toContain('Uralt ohne Sterbedatum')
  })

  it('29. Februar in Nicht-Schaltjahren am 28.', () => {
    const [b] = upcomingBirthdays(tree([['Schalttag', '2004-02-29']]), today)
    expect([b.date.getFullYear(), b.date.getMonth() + 1, b.date.getDate()]).toEqual([2027, 2, 28])
    const [c] = upcomingBirthdays(tree([['Schalttag', '2004-02-29']]), new Date(2027, 11, 1))
    expect([c.date.getFullYear(), c.date.getMonth() + 1, c.date.getDate()]).toEqual([2028, 2, 29])
  })

  it('in Worten', () => {
    expect([0, 1, 5].map(daysText)).toEqual(['heute', 'morgen', 'in 5 Tagen'])
  })
})
