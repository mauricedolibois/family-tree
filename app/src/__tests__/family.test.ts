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
 * Test family (made up):
 *
 *   Great-grandparents  Anton ⚭ Berta
 *                           │
 *   Grandparents         Carl ⚭ Dora            Erich ⚭ Frida
 *                       ┌───┴────┐                   │
 *   Parents           Gustav ⚭ Hanna         Ida ⚭ Jonas
 *                        │              │   │
 *   Me                Kurt (me)      Lena  Mia (Ida & Jonas)
 *
 * Gustav is the son of Carl & Dora, Ida their daughter (so Gustav's sister).
 * Hanna is the daughter of Erich & Frida. Kurt is the son of Gustav & Hanna,
 * Lena the daughter of Hanna only (half-sister), Mia the daughter of Ida & Jonas (cousin).
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

describe('kinship as seen from Kurt', () => {
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

  it('to the great-grandfather, Kurt is the great-grandson', () => {
    expect(kin(t, 'anton', 'kurt')).toBe('Dein Urenkel')
  })

  it('parents-in-law and brother-in-law', () => {
    expect(kin(t, 'gustav', 'erich')).toBe('Dein Schwiegervater')
    expect(kin(t, 'hanna', 'ida')).toBe('Deine Schwägerin')
    expect(kin(t, 'carl', 'hanna')).toBe('Deine Schwiegertochter')
  })

  it('nobody is related to themselves', () => {
    expect(kin(t, 'kurt', 'kurt')).toBeNull()
  })

  it('via the spouse: no "Dein" in front of the chain', () => {
    expect(kin(t, 'hanna', 'mia')).toBe('Nichte deines Mannes')
    expect(kin(t, 'erich', 'gustav')).toBe('Dein Schwiegersohn')
  })
})

describe('relation between two people', () => {
  const t = family()
  const ix = buildIndex(t)
  const names = (ids: string[]) => ids.map((id) => t.members[id].name.split(' ')[0])

  it('cousin: path via the shared grandparents', () => {
    const c = findConnection(ix, 'kurt', 'mia')!
    expect(names(c.path)).toEqual(['Kurt', 'Gustav', 'Carl', 'Ida', 'Mia'])
    expect(names(c.common).sort()).toEqual(['Carl', 'Dora'])
    expect(kinshipTitle(c.kinship)).toEqual({ title: 'Cousine', note: '' })
    expect(kinshipSentence(c.kinship, { name: 'Mia' }, { name: 'Kurt' })).toBe('Mia ist die Cousine von Kurt.')
    expect(kinshipSentence(c.reverse, { name: 'Kurt' }, { name: 'Mia' })).toBe('Kurt ist der Cousin von Mia.')
  })

  it('direct line without common ancestors', () => {
    const c = findConnection(ix, 'kurt', 'anton')!
    expect(names(c.path)).toEqual(['Kurt', 'Gustav', 'Carl', 'Anton'])
    expect(c.common).toEqual([])
    expect(kinshipSentence(c.kinship, { name: 'Anton' }, 'you')).toBe('Anton ist dein Urgroßvater.')
    expect(kinshipSentence(c.reverse, 'you', { name: 'Anton' })).toBe('Du bist der Urenkel von Anton.')
  })

  it('aunt and nephew in both directions', () => {
    const c = findConnection(ix, 'kurt', 'ida')!
    expect(kinshipSentence(c.kinship, { name: 'Ida' }, { name: 'Kurt' })).toBe('Ida ist die Tante von Kurt.')
    expect(kinshipSentence(c.reverse, { name: 'Kurt' }, { name: 'Ida' })).toBe('Kurt ist der Neffe von Ida.')
  })

  it('in-law: the path goes through the spouse', () => {
    const c = findConnection(ix, 'hanna', 'mia')!
    expect(names(c.path)).toEqual(['Hanna', 'Gustav', 'Carl', 'Ida', 'Mia'])
    expect(kinshipSentence(c.kinship, { name: 'Mia' }, { name: 'Hanna' })).toBe(
      'Mia ist die Nichte des Mannes von Hanna.',
    )
  })

  it('without a common term: step by step', () => {
    const c = findConnection(ix, 'hanna', 'jonas')!
    expect(c.detour).toBe(3)
    expect(c.path[0]).toBe('hanna')
    expect(c.path[c.path.length - 1]).toBe('jonas')
    expect(kinshipTitle(c.kinship).title).toBe('Ehemann der Schwester des Ehemanns')
    expect(kinshipSentence(c.kinship, { name: 'Jonas' }, 'you')).toBe(
      'Jonas ist der Ehemann der Schwester deines Ehemanns.',
    )
  })

  it('the suffix after the comma goes to the end of the sentence', () => {
    const tree = addRelative(t, 'mia', { relation: 'CHILD', name: 'Pia Weg', gender: 'FEMALE' }).tree
    const pia = Object.values(tree.members).find((m) => m.name === 'Pia Weg')!.id
    const c = findConnection(buildIndex(tree), 'kurt', pia)!
    expect(kinshipSentence(c.kinship, { name: 'Pia' }, { name: 'Kurt' })).toBe(
      'Pia ist die Cousine von Kurt, eine Generation versetzt.',
    )
    expect(kinshipLabel(c.kinship)).toBe('Deine Cousine, eine Generation versetzt')
  })

  it('no connection, and the same person', () => {
    const tree = addRelative(t, 'kurt', { relation: 'SPOUSE', name: 'Nora Fremd', gender: 'FEMALE' }).tree
    const lone = { ...tree, members: { ...tree.members, solo: { ...tree.members.kurt, id: 'solo', spouseId: null } } }
    const ix2 = buildIndex(lone)
    expect(findConnection(ix2, 'kurt', 'solo')).toBeNull()
    expect(findConnection(ix2, 'kurt', 'kurt')).toBeNull()
  })
})

describe('edits', () => {
  it('adding a child links it to both spouses', () => {
    const { tree, id } = addRelative(family(), 'kurt', { relation: 'SPOUSE', name: 'Nora Alt', gender: 'FEMALE' })
    const r = addRelative(tree, 'kurt', { relation: 'CHILD', name: 'Otto Alt', gender: 'MALE' })
    expect(r.tree.members.kurt.childrenIds).toContain(r.id)
    expect(r.tree.members[id].childrenIds).toContain(r.id)
    expect(r.tree.members[r.id].parentIds?.sort()).toEqual(['kurt', id].sort())
  })

  it('does not modify the original tree', () => {
    const t = family()
    const before = JSON.stringify(t)
    addRelative(t, 'kurt', { relation: 'CHILD', name: 'X', gender: 'MALE' })
    updatePerson(t, 'kurt', { name: 'Kurt Neu' })
    expect(JSON.stringify(t)).toBe(before)
  })

  it('rejects a third parent', () => {
    expect(() => addRelative(family(), 'kurt', { relation: 'PARENT', name: 'X', gender: 'MALE' })).toThrow(
      /zwei Eltern/,
    )
  })

  it('adds a parent and marries them to the existing one', () => {
    const { tree, id } = addRelative(family(), 'lena', {
      relation: 'PARENT',
      name: 'Paul Fremd',
      gender: 'MALE',
      marryExistingParent: true,
    })
    // Hanna is already married to Gustav, so no second marriage
    expect(tree.members[id].spouseId).toBeNull()
    expect(tree.members.lena.parentIds?.sort()).toEqual(['hanna', id].sort())
  })

  it('records the spouse of the only parent as a second parent', () => {
    const t = family()
    // Lena is Hanna's daughter only; Hanna is married to Gustav
    expect(spouseOfSingleParent(t, 'lena')).toBe('gustav')
    expect(spouseOfSingleParent(t, 'kurt')).toBeNull() // already has two parents
    const next = addExistingParent(t, 'lena', 'gustav')
    expect(next.members.lena.parentIds?.sort()).toEqual(['gustav', 'hanna'])
    expect(next.members.gustav.childrenIds).toContain('lena')
    expect(t.members.gustav.childrenIds).not.toContain('lena')
  })

  it('no third parent and no descendants as parents', () => {
    expect(() => addExistingParent(family(), 'kurt', 'jonas')).toThrow(/zwei Eltern/)
    const t = addRelative(family(), 'lena', { relation: 'CHILD', name: 'Rudi', gender: 'MALE' })
    expect(() => addExistingParent(t.tree, 'lena', t.id)).toThrow(/nicht Elternteil/)
  })

  it('people in the middle of the tree cannot be deleted', () => {
    const t = family()
    expect(canDelete(t, 'carl')).toBe(false)
    expect(canDelete(t, 'kurt')).toBe(true)
    expect(canDelete(t, 'anton')).toBe(true)
  })

  it('deleting at the top moves children to the spouse', () => {
    const t = deletePerson(family(), 'anton')
    expect(t.members.anton).toBeUndefined()
    expect(t.members.berta.spouseId).toBeNull()
    expect(t.members.carl.parentIds).toEqual(['berta'])
    expect(t.rootId).toBe('berta')
  })

  it('name and gender can be changed', () => {
    const t = updatePerson(family(), 'kurt', { name: '  Kurt Karl Alt ', gender: 'MALE', profile: { job: 'Maler' } })
    expect(t.members.kurt.name).toBe('Kurt Karl Alt')
    expect(t.members.kurt.profile?.job).toBe('Maler')
  })
})

describe('helpers', () => {
  it('siblings and line', () => {
    const ix = buildIndex(family())
    expect(siblingsOf(ix, 'kurt')).toEqual(['lena'])
    const line = lineageOf(ix, 'gustav')
    expect([...line].sort()).toEqual(['anton', 'berta', 'carl', 'dora', 'gustav', 'hanna', 'kurt'].sort())
  })

  it('names and life dates', () => {
    expect(splitName('Karl Friedrich Mustermann')).toEqual({ given: 'Karl Friedrich', surname: 'Mustermann' })
    const p = family().members.kurt
    expect(lifeYears({ ...p, profile: { birthDate: '1919-12-29', deathDate: '1989-03-31' } })).toBe('1919–1989')
    expect(lifeYears({ ...p, profile: { birthDate: '1944-01-13', deathDate: '1944-01-13' } })).toBe('* † 1944')
  })
})

describe('partial dates', () => {
  it.each([
    ['25.12.1944', '1944-12-25'],
    ['5.3.1910', '1910-03-05'],
    ['12.1944', '1944-12'],
    ['1822', '1822'],
    ['1944-12-25', '1944-12-25'],
    ['', null],
    ['31.02.1950', undefined],
    ['44', undefined],
  ])('input %s → %s', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected)
  })

  it('display and edit format', () => {
    expect(formatDate('1778')).toBe('1778')
    expect(formatDate('1778-05')).toBe('Mai 1778')
    expect(formatDate('1944-12-25')).toBe('25.12.1944')
    expect(toDateInput('1778-05')).toBe('05.1778')
  })

  it('marks the age as approximate for year-only dates', () => {
    const p = family().members.kurt
    expect(ageOf({ ...p, profile: { birthDate: '1778', deathDate: '1846' } })).toEqual({ years: 68, approx: true })
    expect(ageOf({ ...p, profile: { birthDate: '1944-12-25', deathDate: '2024-04-04' } })).toEqual({
      years: 79,
      approx: false,
    })
  })
})

describe('line scope', () => {
  const t = family()
  const ix = buildIndex(t)
  const view = (scope: Parameters<typeof lineageView>[2]) => [...lineageView(ix, 'kurt', scope)].sort()

  it('direct only: ancestors without siblings', () => {
    expect(view({ up: null, down: null, side: 0 })).toEqual(
      ['anton', 'berta', 'carl', 'dora', 'erich', 'frida', 'gustav', 'hanna', 'kurt'].sort(),
    )
  })

  it('with siblings: half-sister and aunt, but no cousin', () => {
    const v = view({ up: null, down: null, side: 1 })
    expect(v).toEqual(expect.arrayContaining(['lena', 'ida']))
    expect(v).not.toContain('mia')
    expect(v).not.toContain('jonas')
  })

  it('with cousins: the cousin and her father are added', () => {
    expect(view({ up: null, down: null, side: 2 })).toEqual(expect.arrayContaining(['mia', 'jonas']))
  })

  it('limits generations upwards', () => {
    const v = view({ up: 1, down: null, side: 1 })
    expect(v).toEqual(expect.arrayContaining(['gustav', 'hanna', 'lena']))
    expect(v).not.toContain('carl')
    expect(v).not.toContain('ida')
  })
})

describe('scope in words (for print)', () => {
  it('generations', () => {
    expect([0, 1, 3].map(generations)).toEqual(['keine', '1 Generation', '3 Generationen'])
  })

  it('line', () => {
    expect(describeLineScope({ up: null, down: 0, side: 0 }, { up: 9, down: 2 })).toBe(
      'Vorfahren: alle 9 Generationen, Nachkommen: keine, ohne Seitenlinien',
    )
    expect(describeLineScope({ up: 2, down: null, side: 2 }, { up: 9, down: 0 })).toBe(
      'Vorfahren: 2 Generationen, Nachkommen: keine, mit Geschwistern und deren Kindern',
    )
  })
})
