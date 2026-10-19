/**
 * @jest-environment node
 */
// Die App auf Englisch: Verwandtschaft, Daten, Sprache des Browsers.
import { buildIndex, type Person, type Tree } from '@/family/model'
import { describeKinship, findConnection, kinshipLabel, kinshipSentence, kinshipTitle } from '@/family/kinship'
import { addRelative } from '@/family/edit'
import { describeLineScope, formatDate, generations, lifeYears, parseDateInput, toDateInput } from '@/family/format'
import { daysText } from '@/family/birthdays'
import { birthdayCalendar } from '@/family/ical'
import { calendarLang, calendarQuery } from '@/family/calendarLink'
import { langFromAcceptLanguage, langFromRequest } from '@/i18n/lang'

/** Dieselbe erfundene Familie wie in family.test.ts */
function family(): Tree {
  const m = (
    id: string,
    name: string,
    gender: 'MALE' | 'FEMALE',
    spouseId: string | null,
    childrenIds: string[] = [],
  ): Person => ({ id, name, gender, spouseId, parentIds: [], childrenIds, adoptedChildrenIds: [], profile: {} })
  const members: Record<string, Person> = {
    anton: m('anton', 'Anton Alt', 'MALE', 'berta', ['carl']),
    berta: m('berta', 'Berta Alt', 'FEMALE', 'anton', ['carl']),
    carl: m('carl', 'Carl Alt', 'MALE', 'dora', ['gustav', 'ida']),
    dora: m('dora', 'Dora Alt', 'FEMALE', 'carl', ['gustav', 'ida']),
    erich: m('erich', 'Erich Neu', 'MALE', 'frida', ['hanna']),
    frida: m('frida', 'Frida Neu', 'FEMALE', 'erich', ['hanna']),
    gustav: m('gustav', 'Gustav Alt', 'MALE', 'hanna', ['kurt']),
    hanna: m('hanna', 'Hanna Alt', 'FEMALE', 'gustav', ['kurt', 'lena']),
    ida: m('ida', 'Ida Weg', 'FEMALE', 'jonas', ['mia']),
    jonas: m('jonas', 'Jonas Weg', 'MALE', 'ida', ['mia']),
    kurt: m('kurt', 'Kurt Alt', 'MALE', null),
    lena: m('lena', 'Lena Alt', 'FEMALE', null),
    mia: m('mia', 'Mia Weg', 'FEMALE', null),
  }
  for (const p of Object.values(members)) for (const c of p.childrenIds) members[c].parentIds!.push(p.id)
  return { version: 3, rootId: 'kurt', members }
}

describe('Relationships in English', () => {
  const t = family()
  const ix = buildIndex(t)
  const label = (me: string, other: string) => {
    const k = describeKinship(ix, me, other)
    return k ? kinshipLabel(k, 'en') : null
  }

  it.each([
    ['gustav', 'Your father'],
    ['dora', 'Your grandmother'],
    ['anton', 'Your great-grandfather'],
    ['ida', 'Your aunt'],
    ['jonas', 'Your uncle by marriage'],
    ['mia', 'Your cousin'],
    ['lena', 'Your half-sister'],
  ])('Kurt → %s: %s', (other, expected) => {
    expect(label('kurt', other)).toBe(expected)
  })

  it('in-laws and chains through the spouse', () => {
    expect(label('anton', 'kurt')).toBe('Your great-grandson')
    expect(label('gustav', 'erich')).toBe('Your father-in-law')
    expect(label('hanna', 'ida')).toBe('Your sister-in-law')
    expect(label('hanna', 'mia')).toBe('Your husband’s niece')
  })

  it('sentences', () => {
    const c = findConnection(ix, 'kurt', 'ida')!
    expect(kinshipSentence(c.kinship, { name: 'Ida' }, { name: 'Kurt' }, 'en')).toBe('Ida is Kurt’s aunt.')
    expect(kinshipSentence(c.reverse, { name: 'Kurt' }, { name: 'Ida' }, 'en')).toBe('Kurt is Ida’s nephew.')
    const a = findConnection(ix, 'kurt', 'anton')!
    expect(kinshipSentence(a.kinship, { name: 'Anton' }, 'you', 'en')).toBe('Anton is your great-grandfather.')
    expect(kinshipSentence(a.reverse, 'you', { name: 'Anton' }, 'en')).toBe('You are Anton’s great-grandson.')
    expect(kinshipSentence(c.kinship, { name: 'Ida' }, { name: 'Jonas' }, 'en')).toBe('Ida is Jonas’ aunt.')
  })

  it('step by step without a common term', () => {
    const c = findConnection(ix, 'hanna', 'jonas')!
    expect(kinshipTitle(c.kinship, 'en').title).toBe('Husband’s sister’s husband')
    expect(kinshipSentence(c.kinship, { name: 'Jonas' }, 'you', 'en')).toBe('Jonas is your husband’s sister’s husband.')
  })

  it('cousins once removed', () => {
    const tree = addRelative(t, 'mia', { relation: 'CHILD', name: 'Pia Weg', gender: 'FEMALE' }).tree
    const pia = Object.values(tree.members).find((p) => p.name === 'Pia Weg')!.id
    const c = findConnection(buildIndex(tree), 'kurt', pia)!
    expect(kinshipLabel(c.kinship, 'en')).toBe('Your first cousin once removed')
    expect(kinshipTitle(c.kinship, 'en')).toEqual({ title: 'First cousin once removed', note: '' })
    // Deutsch bleibt wie gehabt
    expect(kinshipLabel(c.kinship)).toBe('Deine Cousine, eine Generation versetzt')
  })
})

describe('Dates and words', () => {
  const p = (profile: Person['profile']): Person => ({
    id: 'p',
    name: 'Erika Beispiel',
    gender: 'FEMALE',
    spouseId: null,
    parentIds: [],
    childrenIds: [],
    profile,
  })

  it('dates', () => {
    expect(formatDate('1944-12-25', 'en')).toBe('Dec 25, 1944')
    expect(formatDate('1778-05', 'en')).toBe('May 1778')
    expect(formatDate('1778', 'en')).toBe('1778')
    expect(toDateInput('1944-12-25', 'en')).toBe('12/25/1944')
    expect(toDateInput('1778-05', 'en')).toBe('05/1778')
    expect(parseDateInput('12/25/1944')).toBe('1944-12-25')
    expect(parseDateInput('5/1778')).toBe('1778-05')
    expect(parseDateInput('25.12.1944')).toBe('1944-12-25')
    expect(parseDateInput('13/25/1944')).toBeUndefined()
  })

  it('years on the cards', () => {
    expect(lifeYears(p({ birthDate: '1990' }), 'en')).toBe('b. 1990')
    expect(lifeYears(p({ deathDate: '1950' }), 'en')).toBe('d. 1950')
    expect(lifeYears(p({ birthDate: '1888', deceased: true }), 'en')).toBe('1888–†')
    expect(lifeYears(p({ birthDate: '1919', deathDate: '1989' }), 'en')).toBe('1919–1989')
  })

  it('generations, line scope, birthdays', () => {
    expect([0, 1, 3].map((n) => generations(n, 'en'))).toEqual(['none', '1 generation', '3 generations'])
    expect(describeLineScope({ up: null, down: 0, side: 1 }, { up: 4, down: 2 }, 'en')).toBe(
      'Ancestors: all 4 generations, Descendants: none, with siblings',
    )
    expect([0, 1, 5].map((d) => daysText(d, 'en'))).toEqual(['today', 'tomorrow', 'in 5 days'])
  })
})

describe('Language of the browser', () => {
  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['de-DE,de;q=0.9,en;q=0.8', 'de'],
    ['fr-FR,fr;q=0.9', 'en'],
    ['fr-FR,de;q=0.7,en;q=0.5', 'de'],
    ['en;q=0.3,de;q=0.8', 'de'],
    ['', 'de'],
  ])('%s → %s', (header, lang) => {
    expect(langFromAcceptLanguage(header)).toBe(lang)
  })

  it('own choice in the cookie wins', () => {
    expect(langFromRequest({ headers: { cookie: 'a=1; sprache=de', 'accept-language': 'en-US' } })).toBe('de')
    expect(langFromRequest({ headers: { cookie: 'sprache=en', 'accept-language': 'de-DE' } })).toBe('en')
    expect(langFromRequest({ headers: { 'accept-language': 'en-GB' } })).toBe('en')
  })
})

describe('Calendar in English', () => {
  it('link carries the language, feed uses it', () => {
    expect(calendarQuery(null, 'en')).toBe('?sprache=en')
    expect(calendarQuery(null)).toBe('')
    expect(calendarLang({ sprache: 'en' })).toBe('en')
    expect(calendarLang({})).toBe('de')
    const t = family()
    t.members.kurt.profile = { birthDate: '1990-11-27' }
    const ics = birthdayCalendar(t, { calendarName: 'Birthdays', now: new Date(2026, 9, 18), lang: 'en' })
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Kurt Alt turns 36.')
  })
})
