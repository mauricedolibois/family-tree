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
  it('accepts a valid tree and strips unknown fields', () => {
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
    ['not an object', null],
    ['wrong version', { version: 2, rootId: 'a', members: { a: member('a') } }],
    ['empty tree', tree({})],
    ['missing root', tree({ a: member('a') }, 'zzz')],
    ['id does not match key', tree({ a: member('b') })],
    ['unknown gender', tree({ a: member('a', { gender: 'X' }) })],
    ['broken date', tree({ a: member('a', { profile: { birthDate: '12.03.1950' } }) })],
    ['script URL', tree({ a: member('a', { profile: { titleImageUrl: 'javascript:alert(1)' } }) })],
  ])('rejects: %s', (_label, input) => {
    expect(validateStoredTree(input).ok).toBe(false)
  })

  it('keeps birth place and maiden name', () => {
    const profile = { birthDate: '1950', birthPlace: 'Saarlouis', maidenName: 'Müller', media: [] }
    const r = validateStoredTree(tree({ a: member('a', { profile }) }))
    expect(r.ok && r.tree.members.a.profile?.birthPlace).toBe('Saarlouis')
    expect(r.ok && r.tree.members.a.profile?.maidenName).toBe('Müller')
  })

  it('drops links to people who do not exist', () => {
    const r = validateStoredTree(tree({ a: member('a', { childrenIds: ['nope'], spouseId: 'weg' }) }))
    expect(r.ok && r.tree.members.a.childrenIds).toEqual([])
    expect(r.ok && r.tree.members.a.spouseId).toBeNull()
  })

  it('keeps adoptions only for actual children', () => {
    const r = validateStoredTree(
      tree({ a: member('a', { childrenIds: ['b'], adoptedChildrenIds: ['b', 'c'] }), b: member('b'), c: member('c') }),
    )
    expect(r.ok && r.tree.members.a.adoptedChildrenIds).toEqual(['b'])
  })
})
