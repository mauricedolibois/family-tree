import { addRelative, deletePerson, starterTree, updatePerson } from '@/family/edit'
import { describeChange } from '@/storage/changes'

describe('backup note', () => {
  const base = starterTree()
  const child = Object.values(base.members).find((m) => m.id !== base.rootId && m.childrenIds.length === 0)!.id

  it('nothing changed → no backup', () => {
    expect(describeChange(base, JSON.parse(JSON.stringify(base)))).toBeNull()
  })

  it('edited person', () => {
    const next = updatePerson(base, child, { name: 'Kind Neu' })
    expect(describeChange(base, next)).toBe('bearbeitet: Kind Neu')
  })

  it("new person, without the parents' changed links", () => {
    const { tree } = addRelative(base, child, { relation: 'CHILD', name: 'Enkel', gender: 'MALE' })
    expect(describeChange(base, tree)).toBe('hinzugefügt: Enkel')
  })

  it('removed person', () => {
    const next = deletePerson(base, child)
    expect(describeChange(base, next)).toBe('entfernt: Kind')
  })

  it('abbreviates long lists of names', () => {
    let t = base
    for (const n of ['A', 'B', 'C', 'D', 'E'])
      t = addRelative(t, base.rootId, { relation: 'CHILD', name: n, gender: 'MALE' }).tree
    expect(describeChange(base, t)).toBe('hinzugefügt: A, B, C und 2 weitere')
  })
})
