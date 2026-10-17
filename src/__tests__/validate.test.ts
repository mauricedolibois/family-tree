import { validateStoredTree } from '@/storage/validate'

const member = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Person ${id}`,
  gender: 'MALE',
  spouseId: null,
  parentIds: [],
  childrenIds: [],
  adoptedChildrenIds: [],
  profile: { birthDate: '1950-01-02', media: [] },
  ...extra,
})

const tree = (members: Record<string, unknown>, rootId = 'a') => ({ version: 3, rootId, members })

describe('validateStoredTree', () => {
  it('akzeptiert einen gültigen Baum und entfernt unbekannte Felder', () => {
    const r = validateStoredTree(
      tree({
        a: member('a', { childrenIds: ['b'], hacker: 'x' }),
        b: member('b', { parentIds: ['a'], gender: 'FEMALE' }),
      }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.tree.members.a as any).hacker).toBeUndefined()
      expect(r.tree.members.b.parentIds).toEqual(['a'])
    }
  })

  it.each([
    ['kein Objekt', null],
    ['falsche Version', { version: 2, rootId: 'a', members: { a: member('a') } }],
    ['leerer Baum', tree({})],
    ['Wurzel fehlt', tree({ a: member('a') }, 'zzz')],
    ['ID passt nicht zum Schlüssel', tree({ a: member('b') })],
    ['unbekanntes Geschlecht', tree({ a: member('a', { gender: 'X' }) })],
    ['kaputtes Datum', tree({ a: member('a', { profile: { birthDate: '12.03.1950' } }) })],
    ['Skript-URL', tree({ a: member('a', { profile: { titleImageUrl: 'javascript:alert(1)' } }) })],
  ])('lehnt ab: %s', (_label, input) => {
    expect(validateStoredTree(input).ok).toBe(false)
  })

  it('entfernt Verweise auf Personen, die es nicht gibt', () => {
    const r = validateStoredTree(tree({ a: member('a', { childrenIds: ['nope'], spouseId: 'weg' }) }))
    expect(r.ok && r.tree.members.a.childrenIds).toEqual([])
    expect(r.ok && r.tree.members.a.spouseId).toBeNull()
  })

  it('übernimmt Adoptionen nur für echte Kinder', () => {
    const r = validateStoredTree(
      tree({ a: member('a', { childrenIds: ['b'], adoptedChildrenIds: ['b', 'c'] }), b: member('b'), c: member('c') }),
    )
    expect(r.ok && r.tree.members.a.adoptedChildrenIds).toEqual(['b'])
  })
})
