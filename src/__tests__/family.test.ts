import { buildIndex, lineageOf, siblingsOf, type Tree } from '@/family/model'
import { describeKinship } from '@/family/kinship'
import { addRelative, canDelete, deletePerson, normalize, updatePerson } from '@/family/edit'
import { lifeYears, splitName } from '@/family/format'

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
  return k ? `${k.possessive} ${k.term}` : null
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
