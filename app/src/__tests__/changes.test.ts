import { addRelative, deletePerson, starterTree, updatePerson } from '@/family/edit'
import { changeNote, describeChange } from '@/storage/changes'

const note = (a: Parameters<typeof describeChange>[0], b: Parameters<typeof describeChange>[1]) => {
  const c = describeChange(a, b)
  return c && changeNote(c)
}

describe('what changed', () => {
  const base = starterTree()
  const child = Object.values(base.members).find((m) => m.id !== base.rootId && m.childrenIds.length === 0)!.id

  it('nothing changed → no backup', () => {
    expect(describeChange(base, JSON.parse(JSON.stringify(base)))).toBeNull()
  })

  it('edited person', () => {
    const next = updatePerson(base, child, { name: 'Kind Neu' })
    expect(describeChange(base, next)).toEqual({
      added: [],
      removed: [],
      edited: ['Kind Neu'],
      relinked: [],
      rootChanged: false,
    })
    expect(note(base, next)).toBe('edited: Kind Neu')
  })

  it("new person, without the parents' changed links", () => {
    const { tree } = addRelative(base, child, { relation: 'CHILD', name: 'Enkel', gender: 'MALE' })
    expect(describeChange(base, tree)?.added).toEqual(['Enkel'])
    expect(note(base, tree)).toBe('added: Enkel')
  })

  it('removed person', () => {
    const next = deletePerson(base, child)
    expect(note(base, next)).toBe('removed: Kind')
  })

  it('abbreviates long lists of names', () => {
    let t = base
    for (const n of ['A', 'B', 'C', 'D', 'E'])
      t = addRelative(t, base.rootId, { relation: 'CHILD', name: n, gender: 'MALE' }).tree
    expect(describeChange(base, t)?.added).toHaveLength(5)
    expect(note(base, t)).toBe('added: A, B, C and 2 more')
  })
})
