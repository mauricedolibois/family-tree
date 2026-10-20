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
    ['relative URL outside /api/media', tree({ a: member('a', { profile: { titleImageUrl: '/api/admin' } }) })],
  ])('rejects: %s', (_label, input) => {
    expect(validateStoredTree(input).ok).toBe(false)
  })

  it('accepts links to uploaded files', () => {
    const photo = '/api/media/11111111-1111-1111-1111-111111111111/0f0e-anna.jpg'
    const profile = { titleImageUrl: photo, media: [{ id: 'm1', kind: 'image', url: photo }] }
    const r = validateStoredTree(tree({ a: member('a', { profile }) }))
    expect(r.ok && r.tree.members.a.profile?.titleImageUrl).toBe(photo)
    expect(r.ok && r.tree.members.a.profile?.media?.[0].url).toBe(photo)
  })

  it('accepts links into an export archive only for imports', () => {
    const profile = { titleImageUrl: 'media/0f0e-anna.jpg', media: [] }
    const input = tree({ a: member('a', { profile }) })
    expect(validateStoredTree(input).ok).toBe(false)
    expect(validateStoredTree(input, { archiveLinks: true }).ok).toBe(true)
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
