import { buildIndex, lineageOf, lineageView, siblingsOf, type Tree } from '@/family/model'
import { describeKinship, findConnection, kinshipLabel, kinshipSentence, kinshipTitle } from '@/family/kinship'
import {
  addExistingParent,
  addRelative,
  canDelete,
  deletePerson,
  normalize,
  spouseOfSingleParent,
  updatePerson,
} from '@/family/edit'
import {
  ageOf,
  describeLineScope,
  formatDate,
  generations,
  lifeYears,
  parseDateInput,
  splitName,
  toDateInput,
} from '@/family/format'

/**
 * Testfamilie (erfunden):
 *
 *   Urgroßeltern  Anton ⚭ Berta
 *                     │
 *   Großeltern     Carl ⚭ Dora            Erich ⚭ Frida
 *                 ┌───┴────┐                   │
 *   Eltern      Gustav ⚭ Hanna         Ida ⚭ Jonas
 *                  │              │   │
 *   Ich         Kurt (ich)     Lena  Mia (Ida & Jonas)
 *
 * Gustav ist Sohn von Carl & Dora, Ida ist Tochter von Carl & Dora (also Gustavs Schwester).
 * Hanna ist Tochter von Erich & Frida. Kurt ist Sohn von Gustav & Hanna,
 * Lena ist Tochter nur von Hanna (Halbschwester), Mia ist Tochter von Ida & Jonas (Cousine).
 */
function family(): Tree {
  const m = (
    id: string,
    name: string,
    gender: 'MALE' | 'FEMALE',
    spouseId: string | null,
    childrenIds: string[] = [],
  ) => ({
    id,
    name,
    gender,
    spouseId,
    parentIds: [],
    childrenIds,
    adoptedChildrenIds: [],
    profile: { media: [] },
  })
  return normalize({
    version: 3,
    rootId: 'anton',
    members: {
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
    },
  })
}

const kin = (tree: Tree, me: string, other: string) => {
  const k = describeKinship(buildIndex(tree), me, other)
  return k ? kinshipLabel(k) : null
}

describe('Verwandtschaft aus Sicht von Kurt', () => {
  const t = family()
  it.each([
    ['gustav', 'Dein Vater'],
    ['dora', 'Deine Großmutter'],
    ['anton', 'Dein Urgroßvater'],
    ['ida', 'Deine Tante'],
    ['jonas', 'Dein Onkel (angeheiratet)'],
    ['mia', 'Deine Cousine'],
    ['lena', 'Deine Halbschwester'],
    ['frida', 'Deine Großmutter'],
  ])('%s → %s', (other, expected) => {
    expect(kin(t, 'kurt', other)).toBe(expected)
  })

  it('aus Sicht des Urgroßvaters ist Kurt der Urenkel', () => {
    expect(kin(t, 'anton', 'kurt')).toBe('Dein Urenkel')
  })

  it('Schwiegereltern und Schwager', () => {
    expect(kin(t, 'gustav', 'erich')).toBe('Dein Schwiegervater')
    expect(kin(t, 'hanna', 'ida')).toBe('Deine Schwägerin')
    expect(kin(t, 'carl', 'hanna')).toBe('Deine Schwiegertochter')
  })

  it('niemand ist mit sich selbst verwandt', () => {
    expect(kin(t, 'kurt', 'kurt')).toBeNull()
  })

  it('über den Ehepartner: kein „Dein“ vor der Kette', () => {
    expect(kin(t, 'hanna', 'mia')).toBe('Nichte deines Mannes')
    expect(kin(t, 'erich', 'gustav')).toBe('Dein Schwiegersohn')
  })
})

describe('Beziehung zwischen zwei Personen', () => {
  const t = family()
  const ix = buildIndex(t)
  const names = (ids: string[]) => ids.map((id) => t.members[id].name.split(' ')[0])

  it('Cousine: Weg über die gemeinsamen Großeltern', () => {
    const c = findConnection(ix, 'kurt', 'mia')!
    expect(names(c.path)).toEqual(['Kurt', 'Gustav', 'Carl', 'Ida', 'Mia'])
    expect(names(c.common).sort()).toEqual(['Carl', 'Dora'])
    expect(kinshipTitle(c.kinship)).toEqual({ title: 'Cousine', note: '' })
    expect(kinshipSentence(c.kinship, { name: 'Mia' }, { name: 'Kurt' })).toBe('Mia ist die Cousine von Kurt.')
    expect(kinshipSentence(c.reverse, { name: 'Kurt' }, { name: 'Mia' })).toBe('Kurt ist der Cousin von Mia.')
  })

  it('direkte Linie ohne gemeinsame Vorfahren', () => {
    const c = findConnection(ix, 'kurt', 'anton')!
    expect(names(c.path)).toEqual(['Kurt', 'Gustav', 'Carl', 'Anton'])
    expect(c.common).toEqual([])
    expect(kinshipSentence(c.kinship, { name: 'Anton' }, 'you')).toBe('Anton ist dein Urgroßvater.')
    expect(kinshipSentence(c.reverse, 'you', { name: 'Anton' })).toBe('Du bist der Urenkel von Anton.')
  })

  it('Tante und Neffe in beide Richtungen', () => {
    const c = findConnection(ix, 'kurt', 'ida')!
    expect(kinshipSentence(c.kinship, { name: 'Ida' }, { name: 'Kurt' })).toBe('Ida ist die Tante von Kurt.')
    expect(kinshipSentence(c.reverse, { name: 'Kurt' }, { name: 'Ida' })).toBe('Kurt ist der Neffe von Ida.')
  })

  it('angeheiratet: Weg führt über den Ehepartner', () => {
    const c = findConnection(ix, 'hanna', 'mia')!
    expect(names(c.path)).toEqual(['Hanna', 'Gustav', 'Carl', 'Ida', 'Mia'])
    expect(kinshipSentence(c.kinship, { name: 'Mia' }, { name: 'Hanna' })).toBe(
      'Mia ist die Nichte des Mannes von Hanna.',
    )
  })

  it('ohne gängige Bezeichnung: Schritt für Schritt', () => {
    const c = findConnection(ix, 'hanna', 'jonas')!
    expect(c.detour).toBe(3)
    expect(c.path[0]).toBe('hanna')
    expect(c.path[c.path.length - 1]).toBe('jonas')
    expect(kinshipTitle(c.kinship).title).toBe('Ehemann der Schwester des Ehemanns')
    expect(kinshipSentence(c.kinship, { name: 'Jonas' }, 'you')).toBe(
      'Jonas ist der Ehemann der Schwester deines Ehemanns.',
    )
  })

  it('Zusatz nach dem Komma steht am Satzende', () => {
    const tree = addRelative(t, 'mia', { relation: 'CHILD', name: 'Pia Weg', gender: 'FEMALE' }).tree
    const pia = Object.values(tree.members).find((m) => m.name === 'Pia Weg')!.id
    const c = findConnection(buildIndex(tree), 'kurt', pia)!
    expect(kinshipSentence(c.kinship, { name: 'Pia' }, { name: 'Kurt' })).toBe(
      'Pia ist die Cousine von Kurt, eine Generation versetzt.',
    )
    expect(kinshipLabel(c.kinship)).toBe('Deine Cousine, eine Generation versetzt')
  })

  it('keine Verbindung und dieselbe Person', () => {
    const tree = addRelative(t, 'kurt', { relation: 'SPOUSE', name: 'Nora Fremd', gender: 'FEMALE' }).tree
    const lone = { ...tree, members: { ...tree.members, solo: { ...tree.members.kurt, id: 'solo', spouseId: null } } }
    const ix2 = buildIndex(lone)
    expect(findConnection(ix2, 'kurt', 'solo')).toBeNull()
    expect(findConnection(ix2, 'kurt', 'kurt')).toBeNull()
  })
})

describe('Änderungen', () => {
  it('Kind hinzufügen hängt es an beide Ehepartner', () => {
    const { tree, id } = addRelative(family(), 'kurt', { relation: 'SPOUSE', name: 'Nora Alt', gender: 'FEMALE' })
    const r = addRelative(tree, 'kurt', { relation: 'CHILD', name: 'Otto Alt', gender: 'MALE' })
    expect(r.tree.members.kurt.childrenIds).toContain(r.id)
    expect(r.tree.members[id].childrenIds).toContain(r.id)
    expect(r.tree.members[r.id].parentIds?.sort()).toEqual(['kurt', id].sort())
  })

  it('verändert den Ausgangsbaum nicht', () => {
    const t = family()
    const before = JSON.stringify(t)
    addRelative(t, 'kurt', { relation: 'CHILD', name: 'X', gender: 'MALE' })
    updatePerson(t, 'kurt', { name: 'Kurt Neu' })
    expect(JSON.stringify(t)).toBe(before)
  })

  it('ein drittes Elternteil wird abgelehnt', () => {
    expect(() => addRelative(family(), 'kurt', { relation: 'PARENT', name: 'X', gender: 'MALE' })).toThrow(
      /zwei Eltern/,
    )
  })

  it('Elternteil hinzufügen und mit dem vorhandenen verheiraten', () => {
    const { tree, id } = addRelative(family(), 'lena', {
      relation: 'PARENT',
      name: 'Paul Fremd',
      gender: 'MALE',
      marryExistingParent: true,
    })
    // Hanna ist schon mit Gustav verheiratet, also keine zweite Ehe
    expect(tree.members[id].spouseId).toBeNull()
    expect(tree.members.lena.parentIds?.sort()).toEqual(['hanna', id].sort())
  })

  it('Ehepartner des einzigen Elternteils nachträglich als Elternteil eintragen', () => {
    const t = family()
    // Lena ist nur Hannas Tochter, Hanna ist mit Gustav verheiratet
    expect(spouseOfSingleParent(t, 'lena')).toBe('gustav')
    expect(spouseOfSingleParent(t, 'kurt')).toBeNull() // hat schon zwei Eltern
    const next = addExistingParent(t, 'lena', 'gustav')
    expect(next.members.lena.parentIds?.sort()).toEqual(['gustav', 'hanna'])
    expect(next.members.gustav.childrenIds).toContain('lena')
    expect(t.members.gustav.childrenIds).not.toContain('lena')
  })

  it('kein drittes Elternteil und keine Nachkommen als Eltern', () => {
    expect(() => addExistingParent(family(), 'kurt', 'jonas')).toThrow(/zwei Eltern/)
    const t = addRelative(family(), 'lena', { relation: 'CHILD', name: 'Rudi', gender: 'MALE' })
    expect(() => addExistingParent(t.tree, 'lena', t.id)).toThrow(/nicht Elternteil/)
  })

  it('Personen in der Mitte des Baums lassen sich nicht löschen', () => {
    const t = family()
    expect(canDelete(t, 'carl')).toBe(false)
    expect(canDelete(t, 'kurt')).toBe(true)
    expect(canDelete(t, 'anton')).toBe(true)
  })

  it('Löschen ganz oben hängt Kinder an den Ehepartner', () => {
    const t = deletePerson(family(), 'anton')
    expect(t.members.anton).toBeUndefined()
    expect(t.members.berta.spouseId).toBeNull()
    expect(t.members.carl.parentIds).toEqual(['berta'])
    expect(t.rootId).toBe('berta')
  })

  it('Namen und Geschlecht lassen sich ändern', () => {
    const t = updatePerson(family(), 'kurt', { name: '  Kurt Karl Alt ', gender: 'MALE', profile: { job: 'Maler' } })
    expect(t.members.kurt.name).toBe('Kurt Karl Alt')
    expect(t.members.kurt.profile?.job).toBe('Maler')
  })
})

describe('Hilfsfunktionen', () => {
  it('Geschwister und Linie', () => {
    const ix = buildIndex(family())
    expect(siblingsOf(ix, 'kurt')).toEqual(['lena'])
    const line = lineageOf(ix, 'gustav')
    expect([...line].sort()).toEqual(['anton', 'berta', 'carl', 'dora', 'gustav', 'hanna', 'kurt'].sort())
  })

  it('Namen und Lebensdaten', () => {
    expect(splitName('Karl Friedrich Mustermann')).toEqual({ given: 'Karl Friedrich', surname: 'Mustermann' })
    const p = family().members.kurt
    expect(lifeYears({ ...p, profile: { birthDate: '1919-12-29', deathDate: '1989-03-31' } })).toBe('1919–1989')
    expect(lifeYears({ ...p, profile: { birthDate: '1944-01-13', deathDate: '1944-01-13' } })).toBe('* † 1944')
  })
})

describe('Ungenaue Daten', () => {
  it.each([
    ['25.12.1944', '1944-12-25'],
    ['5.3.1910', '1910-03-05'],
    ['12.1944', '1944-12'],
    ['1822', '1822'],
    ['1944-12-25', '1944-12-25'],
    ['', null],
    ['31.02.1950', undefined],
    ['44', undefined],
  ])('Eingabe %s → %s', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected)
  })

  it('Anzeige und Bearbeiten', () => {
    expect(formatDate('1778')).toBe('1778')
    expect(formatDate('1778-05')).toBe('Mai 1778')
    expect(formatDate('1944-12-25')).toBe('25.12.1944')
    expect(toDateInput('1778-05')).toBe('05.1778')
  })

  it('Alter wird bei Jahresangaben als ungefähr markiert', () => {
    const p = family().members.kurt
    expect(ageOf({ ...p, profile: { birthDate: '1778', deathDate: '1846' } })).toEqual({ years: 68, approx: true })
    expect(ageOf({ ...p, profile: { birthDate: '1944-12-25', deathDate: '2024-04-04' } })).toEqual({
      years: 79,
      approx: false,
    })
  })
})

describe('Umfang der Linie', () => {
  const t = family()
  const ix = buildIndex(t)
  const view = (scope: Parameters<typeof lineageView>[2]) => [...lineageView(ix, 'kurt', scope)].sort()

  it('nur direkt: Vorfahren ohne Geschwister', () => {
    expect(view({ up: null, down: null, side: 0 })).toEqual(
      ['anton', 'berta', 'carl', 'dora', 'erich', 'frida', 'gustav', 'hanna', 'kurt'].sort(),
    )
  })

  it('mit Geschwistern: Halbschwester und Tante, aber keine Cousine', () => {
    const v = view({ up: null, down: null, side: 1 })
    expect(v).toEqual(expect.arrayContaining(['lena', 'ida']))
    expect(v).not.toContain('mia')
    expect(v).not.toContain('jonas')
  })

  it('mit Cousins: die Cousine und ihr Vater kommen dazu', () => {
    expect(view({ up: null, down: null, side: 2 })).toEqual(expect.arrayContaining(['mia', 'jonas']))
  })

  it('Generationen nach oben begrenzen', () => {
    const v = view({ up: 1, down: null, side: 1 })
    expect(v).toEqual(expect.arrayContaining(['gustav', 'hanna', 'lena']))
    expect(v).not.toContain('carl')
    expect(v).not.toContain('ida')
  })
})

describe('Umfang in Worten (für den Druck)', () => {
  it('Generationen', () => {
    expect([0, 1, 3].map(generations)).toEqual(['keine', '1 Generation', '3 Generationen'])
  })

  it('Linie', () => {
    expect(describeLineScope({ up: null, down: 0, side: 0 }, { up: 9, down: 2 })).toBe(
      'Vorfahren: alle 9 Generationen, Nachkommen: keine, ohne Seitenlinien',
    )
    expect(describeLineScope({ up: 2, down: null, side: 2 }, { up: 9, down: 0 })).toBe(
      'Vorfahren: 2 Generationen, Nachkommen: keine, mit Geschwistern und deren Kindern',
    )
  })
})
