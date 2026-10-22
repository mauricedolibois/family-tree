import * as S from '@/family/scope'
import { describeScope, diffScopes, parseScope, type TreeScope } from '@/family/scope'
import type { Relation } from '@/family/edit'
import type { Person, Tree } from '@/family/model'

// Most cases use parts as stored before lines (one start person with side lines):
// they are read as one line and must cover exactly the same people as before.
type Legacy = { person: string; up: number | null; down: number | null; side: 0 | 1 | 2 | 3; hideRest: boolean }
const lines = (l: Legacy): TreeScope => parseScope(l)!
const scopeSets = (t: Tree, l: Legacy) => S.scopeSets(t, lines(l))
const viewFor = (t: Tree, l: Legacy) => S.viewFor(t, lines(l))
const mergeScopedSave = (stored: Tree, sent: Tree, l: Legacy) => S.mergeScopedSave(stored, sent, lines(l))
const canAddInPart = (t: Tree, l: Legacy, id: string, r: Relation) => S.canAddInPart(t, lines(l), id, r)

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
const scope: Legacy = { person: 'X', up: 1, down: 0, side: 1, hideRest: true }
const sorted = (s: Set<string>) => [...s].sort()

describe('scope sets', () => {
  it('cover the start person, ancestors and side lines; the spouse only to see', () => {
    const { visible, editable } = scopeSets(base, scope)
    expect(sorted(visible)).toEqual(['P1', 'P2', 'S', 'X', 'Y'])
    expect(sorted(editable)).toEqual(['P1', 'P2', 'S', 'X'])
  })

  it('lock people on whom family lines outside the part hang', () => {
    // K's line: X's parents also have S, who is not in the part
    const { editable, locked } = scopeSets(base, { person: 'K', up: null, down: null, side: 0, hideRest: true })
    expect(sorted(locked)).toEqual(['P1', 'P2'])
    expect(sorted(editable)).toEqual(['G', 'H', 'K', 'X', 'Y'])
  })

  it('lock a married-in spouse with their own family, never the start person', () => {
    const fromTop = scopeSets(base, { person: 'G', up: null, down: null, side: 0, hideRest: true })
    expect(sorted(fromTop.locked)).toEqual(['X'])
    expect(fromTop.editable.has('K')).toBe(true)
    // X's parents and child are outside, yet X stays editable as the start person
    const alone = scopeSets(base, { person: 'X', up: 0, down: 0, side: 0, hideRest: true })
    expect(alone.locked.has('X')).toBe(false)
    expect(sorted(alone.editable)).toEqual(['X'])
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
    const allUp: Legacy = { ...scope, up: null }
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
    const wide: Legacy = { ...scope, down: 1 }
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

  it('refuses changing or deleting a locked person', () => {
    const line: Legacy = { person: 'K', up: null, down: null, side: 0, hideRest: true }
    const changed = copy(viewFor(base, line))
    changed.members.P1.name = 'Changed'
    expect(mergeScopedSave(base, changed, line)).toMatchObject({ ok: false, error: 'outside scope' })
    const gone = copy(viewFor(base, line))
    delete gone.members.P1
    gone.members.P2.spouseId = null
    gone.members.X.parentIds = ['P2']
    expect(mergeScopedSave(base, gone, line).ok).toBe(false)
  })

  it('still gives a couple a new child when one of them is locked', () => {
    const fromTop: Legacy = { person: 'G', up: null, down: null, side: 0, hideRest: true }
    const sent = copy(viewFor(base, fromTop))
    sent.members.N = person('N', { parentIds: ['Y', 'X'] })
    sent.members.Y.childrenIds = [...sent.members.Y.childrenIds, 'N']
    sent.members.X.childrenIds = [...sent.members.X.childrenIds, 'N']
    const r = mergeScopedSave(base, sent, fromTop)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.X.childrenIds).toEqual(['K', 'N'])
    expect(r.tree.members.X.parentIds).toEqual(['P1', 'P2'])
  })

  it('with the rest visible, refuses edits outside the part', () => {
    const sent = copy(base)
    sent.members.G.name = 'Changed'
    expect(mergeScopedSave(base, sent, { ...scope, hideRest: false }).ok).toBe(false)
  })
})

describe('parseScope', () => {
  it('reads a part from before lines as one line, keeping its side lines', () => {
    expect(parseScope({ person: 'X', up: null, down: 2, side: 3, hideRest: true })).toEqual({
      lines: [{ person: 'X', up: null, down: 2, side: 3 }],
      stops: [],
      unlock: [],
      lock: [],
      hideRest: true,
    })
    expect(parseScope({ person: 'X', up: 1, down: 0, side: 0 })?.lines).toEqual([{ person: 'X', up: 1, down: 0 }])
  })

  it('accepts lines and stops, dropping repeated lines', () => {
    const lines = [
      { person: 'A', up: null, down: null },
      { person: 'B', up: 0, down: 1 },
      { person: 'A', up: 1, down: 1 },
    ]
    expect(parseScope({ lines, stops: ['C', 'C'], hideRest: false })).toEqual({
      lines: lines.slice(0, 2),
      stops: ['C'],
      unlock: [],
      lock: [],
      hideRest: false,
    })
  })

  it('refuses malformed scopes', () => {
    for (const bad of [
      null,
      {},
      { person: 'X', up: -1, down: 0, side: 0 },
      { person: 'X', up: 1, down: 0, side: 9 },
      { lines: [] },
      { lines: [{ person: 'A', up: null }] },
      { lines: [{ person: 'A', up: null, down: null }], stops: [1] },
      { lines: Array.from({ length: 21 }, (_, i) => ({ person: `P${i}`, up: null, down: null })) },
    ])
      expect(parseScope(bad)).toBeNull()
  })
})

// Karl + Erna -> Peter, Hans. Peter + Maria -> Lisa. Hans + Ute -> Tim.
// Lisa married Thomas, whose parents are Werner + Gisela; their child Mia.
const family: Tree = {
  version: 3,
  rootId: 'karl',
  members: {
    karl: person('karl', { gender: 'MALE', spouseId: 'erna', childrenIds: ['peter', 'hans'] }),
    erna: person('erna', { spouseId: 'karl', childrenIds: ['peter', 'hans'] }),
    peter: person('peter', { gender: 'MALE', spouseId: 'maria', parentIds: ['karl', 'erna'], childrenIds: ['lisa'] }),
    maria: person('maria', { spouseId: 'peter', childrenIds: ['lisa'] }),
    hans: person('hans', { gender: 'MALE', spouseId: 'ute', parentIds: ['karl', 'erna'], childrenIds: ['tim'] }),
    ute: person('ute', { spouseId: 'hans', childrenIds: ['tim'] }),
    tim: person('tim', { gender: 'MALE', parentIds: ['hans', 'ute'] }),
    lisa: person('lisa', { spouseId: 'thomas', parentIds: ['peter', 'maria'], childrenIds: ['mia'] }),
    thomas: person('thomas', {
      gender: 'MALE',
      spouseId: 'lisa',
      parentIds: ['werner', 'gisela'],
      childrenIds: ['mia'],
    }),
    werner: person('werner', { gender: 'MALE', spouseId: 'gisela', childrenIds: ['thomas'] }),
    gisela: person('gisela', { spouseId: 'werner', childrenIds: ['thomas'] }),
    mia: person('mia', { parentIds: ['lisa', 'thomas'] }),
  },
}
const lineOf = (...people: string[]): TreeScope => ({
  lines: people.map((p) => ({ person: p, up: null, down: null })),
  stops: [],
  unlock: [],
  lock: [],
  hideRest: true,
})
const byStatus = (scope: TreeScope) => {
  const out: Record<string, string[]> = {}
  for (const [id, e] of describeScope(family, scope)) (out[e.status] ??= []).push(id)
  for (const k of Object.keys(out)) out[k].sort()
  return out
}

describe('blood lines', () => {
  it('give only the line: further family lines lock the people they hang on', () => {
    expect(byStatus(lineOf('lisa'))).toEqual({
      editable: ['lisa', 'maria', 'mia', 'peter'],
      locked: ['erna', 'karl', 'thomas'],
      hidden: ['gisela', 'hans', 'tim', 'ute', 'werner'],
    })
    const d = describeScope(family, lineOf('lisa'))
    expect(d.get('karl')?.reason).toEqual({ kind: 'boundary', via: ['hans'] })
    expect(d.get('thomas')?.reason).toEqual({ kind: 'boundary', via: ['werner', 'gisela'] })
    expect(d.get('peter')?.lines).toEqual(['lisa'])
  })

  it('grow by adding the line of another person, which unlocks where they meet', () => {
    const both = lineOf('lisa', 'hans')
    expect(byStatus(both).editable).toEqual(['erna', 'hans', 'karl', 'lisa', 'maria', 'mia', 'peter', 'tim'])
    // Ute married into Hans' line: shown, not editable, without family beyond
    expect(describeScope(family, both).get('ute')).toEqual({ status: 'locked', lines: [], reason: { kind: 'spouse' } })
    expect(S.scopeSets(family, both).locked.has('ute')).toBe(false)
    expect(diffScopes(family, lineOf('lisa'), both)).toEqual({
      gained: ['hans', 'tim'],
      unlocked: ['karl', 'erna'],
      locked: ['ute'],
      lost: [],
    })
  })

  it('end at a stop: the stop belongs to the part, nobody beyond', () => {
    const d = describeScope(family, { ...lineOf('lisa'), stops: ['peter'] })
    expect(d.get('peter')?.reason).toEqual({ kind: 'stop', via: ['karl', 'erna'] })
    expect(d.get('karl')?.status).toBe('hidden')
    expect(d.get('maria')?.status).toBe('editable')
  })

  it('show the rest read-only when it is not hidden', () => {
    expect(describeScope(family, { ...lineOf('lisa'), hideRest: false }).get('hans')?.status).toBe('readonly')
  })

  it('compare with the whole tree', () => {
    const d = diffScopes(family, null, lineOf('lisa'))
    expect(d.gained).toEqual([])
    expect(d.locked.sort()).toEqual(['erna', 'karl', 'thomas'])
    expect(d.lost.sort()).toEqual(['gisela', 'hans', 'tim', 'ute', 'werner'])
  })

  it('keep the people of all lines: none of them can be deleted', () => {
    const scope = lineOf('lisa', 'hans')
    const sent = copy(S.viewFor(family, scope))
    delete sent.members.tim
    sent.members.hans.childrenIds = []
    sent.members.ute.childrenIds = []
    expect(S.mergeScopedSave(family, sent, scope).ok).toBe(true)
    const noHans = copy(S.viewFor(family, scope))
    delete noHans.members.hans
    expect(S.mergeScopedSave(family, noHans, scope)).toMatchObject({ ok: false })
  })
})

describe('exceptions', () => {
  const lisa = lineOf('lisa')

  it('let a locked person be edited all the same, but only their details', () => {
    const scope = { ...lisa, unlock: ['karl'] }
    expect(describeScope(family, scope).get('karl')).toMatchObject({ status: 'editable', detailsOnly: true })
    const sets = S.scopeSets(family, scope)
    expect(sets.locked.has('karl')).toBe(false)
    expect(sets.detailsOnly.has('karl')).toBe(true)

    const renamed = copy(S.viewFor(family, scope))
    renamed.members.karl.name = 'Karl B.'
    renamed.members.karl.childrenIds = [] // links cannot be changed this way
    const r = S.mergeScopedSave(family, renamed, scope)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.karl.name).toBe('Karl B.')
    expect(r.tree.members.karl.childrenIds).toEqual(['peter', 'hans'])
  })

  it('never let such a person be deleted or get new relatives', () => {
    const scope = { ...lisa, unlock: ['karl'] }
    const gone = copy(S.viewFor(family, scope))
    delete gone.members.karl
    expect(S.mergeScopedSave(family, gone, scope).ok).toBe(false)

    const parent = copy(S.viewFor(family, scope))
    parent.members.N = person('N', { childrenIds: ['karl'] })
    expect(S.mergeScopedSave(family, parent, scope).ok).toBe(false)
    // On the whole tree; members get these people from the server (detailsOnlyIds)
    expect(S.canAddInPart(family, scope, 'karl', 'PARENT')).toBe(false)
  })

  it('still give a couple a new child when one of them may change only their details', () => {
    const scope = { ...lisa, unlock: ['thomas'] }
    const sent = copy(S.viewFor(family, scope))
    sent.members.N = person('N', { parentIds: ['lisa', 'thomas'] })
    sent.members.lisa.childrenIds = [...sent.members.lisa.childrenIds, 'N']
    sent.members.thomas.childrenIds = [...sent.members.thomas.childrenIds, 'N']
    const r = S.mergeScopedSave(family, sent, scope)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.members.thomas.childrenIds).toEqual(['mia', 'N'])
  })

  it('lock a single person of the part, never the start person', () => {
    const scope = { ...lisa, lock: ['peter', 'lisa'] }
    const d = describeScope(family, scope)
    expect(d.get('peter')).toMatchObject({ status: 'locked', reason: { kind: 'manual' } })
    expect(d.get('lisa')?.status).toBe('editable')
    const sent = copy(S.viewFor(family, scope))
    sent.members.peter.name = 'Changed'
    expect(S.mergeScopedSave(family, sent, scope).ok).toBe(false)
  })

  it('are read from stored scopes', () => {
    expect(parseScope({ ...lisa, unlock: ['karl', 'karl'], lock: ['peter'] })).toMatchObject({
      unlock: ['karl'],
      lock: ['peter'],
    })
    expect(parseScope({ ...lisa, lock: 'peter' })).toBeNull()
  })
})

describe('requests', () => {
  it('let only close relatives confirm who someone is', () => {
    expect(S.isCloseRelative(family, 'peter', 'lisa')).toBe(true) // parent
    expect(S.isCloseRelative(family, 'mia', 'lisa')).toBe(true) // child
    expect(S.isCloseRelative(family, 'thomas', 'lisa')).toBe(true) // spouse
    expect(S.isCloseRelative(family, 'hans', 'peter')).toBe(true) // sibling
    expect(S.isCloseRelative(family, 'hans', 'lisa')).toBe(false) // uncle
    expect(S.isCloseRelative(family, 'lisa', 'lisa')).toBe(false)
    expect(S.isCloseRelative(family, 'nobody', 'lisa')).toBe(false)
  })

  it('ask for a locked person with their descendants, which unlocks them', () => {
    const asked = S.withLine(lineOf('lisa'), S.requestedLine('karl'))
    expect(asked.lines[1]).toEqual({ person: 'karl', up: 0, down: null })
    expect(describeScope(family, asked).get('karl')?.status).toBe('editable')
    expect(describeScope(family, asked).get('hans')?.status).toBe('editable')
  })

  it('add a line once, and drop a stop at its person', () => {
    const scope = { ...lineOf('lisa'), stops: ['karl'] }
    const added = S.withLine(scope, 'karl')
    expect(added.lines.map((l) => l.person)).toEqual(['lisa', 'karl'])
    expect(added.stops).toEqual([])
    expect(S.withLine(added, 'karl')).toBe(added)
  })
})
