import { addRelative, deletePerson, starterTree, updatePerson } from '@/family/edit'
import { describeChange } from '@/storage/changes'

describe('Notiz zur Sicherung', () => {
  const base = starterTree()
  const child = Object.values(base.members).find((m) => m.id !== base.rootId && m.childrenIds.length === 0)!.id

  it('nichts geändert → keine Sicherung', () => {
    expect(describeChange(base, JSON.parse(JSON.stringify(base)))).toBeNull()
  })

  it('bearbeitete Person', () => {
    const next = updatePerson(base, child, { name: 'Kind Neu' })
    expect(describeChange(base, next)).toBe('bearbeitet: Kind Neu')
  })

  it('neue Person ohne die geänderten Verweise der Eltern', () => {
    const { tree } = addRelative(base, child, { relation: 'CHILD', name: 'Enkel', gender: 'MALE' })
    expect(describeChange(base, tree)).toBe('hinzugefügt: Enkel')
  })

  it('entfernte Person', () => {
    const next = deletePerson(base, child)
    expect(describeChange(base, next)).toBe('entfernt: Kind')
  })

  it('viele Namen werden abgekürzt', () => {
    let t = base
    for (const n of ['A', 'B', 'C', 'D', 'E'])
      t = addRelative(t, base.rootId, { relation: 'CHILD', name: n, gender: 'MALE' }).tree
    expect(describeChange(base, t)).toBe('hinzugefügt: A, B, C und 2 weitere')
  })
})
