import { canAddInPart, mergeScopedSave, parseScope, scopeSets, viewFor, type TreeScope } from '@/family/scope'
import type { Person, Tree } from '@/family/model'

// Main family: G + H -> Y. Y married X (married in); their child K.
// X's family of origin: P1 + P2 -> X and sister S.
const person = (id: string, extra: Partial<Person> = {}): Person => ({
  id,
  name: `Person ${id}`,
  gender: 'FEMALE',
  childrenIds: [],
  profile: { media: [] },
  ...extra,
})
const base: Tree = {
  version: 3,
  rootId: 'G',
  members: {
    G: person('G', { gender: 'MALE', spouseId: 'H', childrenIds: ['Y'] }),
    H: person('H', { spouseId: 'G', childrenIds: ['Y'] }),
    Y: person('Y', { gender: 'MALE', spouseId: 'X', parentIds: ['G', 'H'], childrenIds: ['K'] }),
    X: person('X', { spouseId: 'Y', parentIds: ['P1', 'P2'], childrenIds: ['K'] }),
    K: person('K', { parentIds: ['Y', 'X'] }),
    P1: person('P1', { gender: 'MALE', spouseId: 'P2', childrenIds: ['X', 'S'] }),
    P2: person('P2', { spouseId: 'P1', childrenIds: ['X', 'S'] }),
    S: person('S', { parentIds: ['P1', 'P2'] }),
  },
}
const copy = (t: Tree): Tree => JSON.parse(JSON.stringify(t))
// X with parents, siblings, no descendants
const scope: TreeScope = { person: 'X', up: 1, down: 0, side: 1, hideRest: true }
const sorted = (s: Set<string>) => [...s].sort()

describe('scope sets', () => {
  it('cover the start person, ancestors and side lines; the spouse only to see', () => {
    const { visible, editable } = scopeSets(base, scope)
    expect(sorted(visible)).toEqual(['P1', 'P2', 'S', 'X', 'Y'])
    expect(sorted(editable)).toEqual(['P1', 'P2', 'S', 'X'])
  })

  it('are empty when the start person is gone, never the whole tree', () => {
    const { visible, editable } = scopeSets(base, { ...scope, person: 'nobody' })
    expect(visible.size + editable.size).toBe(0)
  })
})

describe('view', () => {
  it('hides the rest and starts at the start person', () => {
    const v = viewFor(base, scope)
    expect(Object.keys(v.members).sort()).toEqual(['P1', 'P2', 'S', 'X', 'Y'])
    expect(v.rootId).toBe('X')
    expect(v.members.X.childrenIds).toEqual([]) // K is hidden
    expect(v.members.X.spouseId).toBe('Y')
  })

  it('shows everything when the rest stays visible', () => {
    expect(viewFor(base, { ...scope, hideRest: false })).toBe(base)
  })
})

describe('saving with a scope', () => {
  const sentView = () => copy(viewFor(base, scope))

  it('adds a grandparent and keeps everything outside the part as stored', () => {
    const allUp: TreeScope = { ...scope, up: null }
    const sent = copy(viewFor(base, allUp))
    sent.members.GP = person('GP', { childrenIds: ['P1'] })
    sent.members.P1.parentIds = ['GP']
    const r = mergeScopedSave(base, sent, allUp)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.GP.childrenIds).toEqual(['P1'])
    expect(r.tree.members.P1.parentIds).toEqual(['GP'])
    for (const id of ['G', 'H', 'Y', 'K']) expect(r.tree.members[id]).toEqual(base.members[id])
    // X's hidden child stays linked although the member never saw it
    expect(r.tree.members.X.childrenIds).toEqual(['K'])
    expect(r.tree.rootId).toBe('G')
  })

  it('takes changes to people in the part', () => {
    const sent = sentView()
    sent.members.S.name = 'Sabine'
    const r = mergeScopedSave(base, sent, scope)
    expect(r.ok && r.tree.members.S.name).toBe('Sabine')
  })

  it('refuses changes to someone visible but outside the part', () => {
    const sent = sentView()
    sent.members.Y.name = 'Changed'
    expect(mergeScopedSave(base, sent, scope)).toMatchObject({ ok: false, error: 'outside scope' })
  })

  it('does not mistake a cleaned-up copy for a change', () => {
    const stored = copy(base)
    delete stored.members.Y.profile
    const sent = copy(viewFor(stored, scope))
    sent.members.Y.profile = { birthDate: null, titleImageUrl: null, media: [] }
    expect(mergeScopedSave(stored, sent, scope).ok).toBe(true)
  })

  it('refuses deleting the start person or someone outside the part', () => {
    const noStart = sentView()
    delete noStart.members.X
    expect(mergeScopedSave(base, noStart, scope).ok).toBe(false)
    const noSpouse = sentView()
    delete noSpouse.members.Y
    noSpouse.members.X.spouseId = null
    expect(mergeScopedSave(base, noSpouse, scope).ok).toBe(false)
  })

  it('deletes people of the part and cleans up their links', () => {
    const sent = sentView()
    delete sent.members.S
    sent.members.P1.childrenIds = ['X']
    sent.members.P2.childrenIds = ['X']
    const r = mergeScopedSave(base, sent, scope)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.S).toBeUndefined()
    expect(r.tree.members.P1.childrenIds).toEqual(['X'])
  })

  it('cannot cut links to the rest of the tree', () => {
    const sent = sentView()
    sent.members.X.spouseId = null
    const r = mergeScopedSave(base, sent, scope)
    expect(r.ok && r.tree.members.X.spouseId).toBe('Y')
  })

  it('cannot attach people of the part to someone outside', () => {
    const sent = copy(base) // a member who sees the rest
    sent.members.S.parentIds = ['G']
    sent.members.G.childrenIds = ['Y', 'S']
    const r = mergeScopedSave(base, sent, { ...scope, hideRest: false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.G.childrenIds).toEqual(['Y'])
    expect(r.tree.members.S.parentIds).toEqual(['P1', 'P2'])
  })

  it('ignores a forged hidden person and refuses loose new people', () => {
    const forged = sentView()
    forged.members.H = person('H', { name: 'Forged' })
    const r = mergeScopedSave(base, forged, scope)
    expect(r.ok && r.tree.members.H).toEqual(base.members.H)
    const loose = sentView()
    loose.members.N = person('N')
    expect(mergeScopedSave(base, loose, scope).ok).toBe(false)
  })

  it('gives a new child of the start person both parents, but nothing else to the spouse', () => {
    const wide: TreeScope = { ...scope, down: 1 }
    const sent = copy(viewFor(base, wide))
    sent.members.N = person('N', { parentIds: ['X', 'Y'] })
    sent.members.X.childrenIds = [...sent.members.X.childrenIds, 'N']
    sent.members.Y.childrenIds = [...sent.members.Y.childrenIds, 'N']
    const r = mergeScopedSave(base, sent, wide)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.Y.childrenIds).toEqual(['K', 'N'])
    expect(r.tree.members.N.parentIds?.sort()).toEqual(['X', 'Y'])
    // A child added to the spouse alone is not part of the member's part
    const onlySpouse = copy(viewFor(base, wide))
    onlySpouse.members.M = person('M', { parentIds: ['Y'] })
    onlySpouse.members.Y.childrenIds = [...onlySpouse.members.Y.childrenIds, 'M']
    expect(mergeScopedSave(base, onlySpouse, wide).ok).toBe(false)
  })

  it('refuses new people who would fall outside the part', () => {
    // one generation of ancestors: a grandparent would be out of reach
    const grandparent = sentView()
    grandparent.members.GP = person('GP', { childrenIds: ['P1'] })
    expect(mergeScopedSave(base, grandparent, scope)).toMatchObject({ ok: false })
    // siblings only: a sibling's child would be out of reach
    const nephew = sentView()
    nephew.members.N = person('N', { parentIds: ['S'] })
    nephew.members.S.childrenIds = ['N']
    expect(mergeScopedSave(base, nephew, scope)).toMatchObject({ ok: false })
  })

  it('tells beforehand which relatives can be added', () => {
    const view = viewFor(base, scope)
    expect(canAddInPart(view, scope, 'S', 'CHILD')).toBe(false)
    // like "only this line": side lines without their spouses
    expect(canAddInPart(view, scope, 'S', 'SPOUSE')).toBe(false)
    expect(canAddInPart(view, { ...scope, down: null }, 'X', 'CHILD')).toBe(true)
    expect(canAddInPart(view, scope, 'P1', 'PARENT')).toBe(false)
    expect(canAddInPart(view, { ...scope, up: null }, 'P1', 'PARENT')).toBe(true)
    expect(canAddInPart(view, scope, 'Y', 'CHILD')).toBe(false) // outside the part
  })

  it('with the rest visible, refuses edits outside the part', () => {
    const sent = copy(base)
    sent.members.G.name = 'Changed'
    expect(mergeScopedSave(base, sent, { ...scope, hideRest: false }).ok).toBe(false)
  })
})

describe('parseScope', () => {
  it('accepts well-formed scopes only', () => {
    expect(parseScope({ person: 'X', up: null, down: 2, side: 3, hideRest: true })).toEqual({
      person: 'X',
      up: null,
      down: 2,
      side: 3,
      hideRest: true,
    })
    for (const bad of [null, {}, { person: 'X', up: -1, down: 0, side: 0 }, { person: 'X', up: 1, down: 0, side: 9 }])
      expect(parseScope(bad)).toBeNull()
  })
})
