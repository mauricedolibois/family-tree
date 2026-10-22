// src/family/scope.ts
// A member's part of the tree: one or more blood lines, each a person with their
// ancestors and descendants, as in "only this line". Members with a part edit only
// that part and, if set so, see only that part. The server cuts what it sends with
// viewFor and checks every save with mergeScopedSave; the client uses scopeSets to
// show edit buttons only where saving would be accepted, and describeScope to show
// a moderator beforehand what a part gives.

import { addRelative, type Relation } from './edit'
import {
  bloodLineOf,
  buildIndex,
  childrenOf,
  lineageView,
  parentsOf,
  siblingsOf,
  spouseOf,
  subTree,
  type LineScope,
  type Person,
  type Tree,
} from './model'

/**
 * One blood line of a part: a person with ancestors and descendants (null = all
 * generations), optionally with side lines (1 siblings, 2 cousins, 3 all), so
 * someone who married in can add their own brothers and sisters. A part grows by
 * adding the line of another person.
 */
export type BloodLine = { person: string; up: number | null; down: number | null; side?: 1 | 2 | 3 }

export type TreeScope = {
  /** The first line's person is the start person: the view starts there */
  lines: BloodLine[]
  /** People where the part ends: they belong to it, nobody beyond them */
  stops: string[]
  /**
   * Exceptions: people of the part limited to their own details ("details only"),
   * or someone who married in allowed that far. People at the edge of the part
   * have that anyway.
   */
  unlock: string[]
  /** Exceptions: people of the part who may only be seen */
  lock: string[]
  /** true: everyone outside the part is hidden; false: visible, read-only */
  hideRest: boolean
}

const MAX_GENERATIONS = 20
export const MAX_LINES = 20
const MAX_STOPS = 20
const MAX_EXCEPTIONS = 50

/** The start person: the first line's person ('' while a part being set has no line yet) */
export const startOf = (scope: TreeScope) => scope.lines[0]?.person ?? ''

/** The people the lines start from; they are never locked and cannot be deleted */
export const linePeople = (scope: TreeScope) => new Set(scope.lines.map((l) => l.person))

/**
 * The part with another blood line (by default the person's whole line); a stop at
 * that person goes. Unchanged when the person has a line already or there are as
 * many lines as allowed.
 */
export function withLine(scope: TreeScope, line: string | BloodLine): TreeScope {
  const add = typeof line === 'string' ? { person: line, up: null, down: null } : line
  if (linePeople(scope).has(add.person) || scope.lines.length >= MAX_LINES) return scope
  return { ...scope, lines: [...scope.lines, add], stops: scope.stops.filter((s) => s !== add.person) }
}

/**
 * What a member asks for at a locked person ("ask for access"): that person and
 * all their descendants as another line, which unlocks them for the member.
 */
export const requestedLine = (personId: string): BloodLine => ({ person: personId, up: 0, down: null })

/**
 * Whether someone who is `confirmer` in the tree may confirm that another member is
 * `claimed`: parents, children, siblings and spouses know each other.
 */
export function isCloseRelative(tree: Tree, confirmer: string, claimed: string): boolean {
  const ix = buildIndex(tree)
  if (!ix.byId.has(confirmer) || !ix.byId.has(claimed) || confirmer === claimed) return false
  const close = [
    ...parentsOf(ix, claimed),
    ...childrenOf(ix, claimed),
    ...siblingsOf(ix, claimed),
    spouseOf(ix, claimed),
  ]
  return close.includes(confirmer)
}

/** Response header with the member's scope (URI-encoded JSON), absent for the whole tree */
export const TREE_SCOPE_HEADER = 'x-tree-scope'

/** Response header with the person in the tree the member is (URI-encoded), absent when not linked */
export const TREE_ME_HEADER = 'x-tree-me'

/** Response header set when a moderator looks at the tree as a member sees it: read only */
export const TREE_PREVIEW_HEADER = 'x-tree-preview'

export const encodeScope = (scope: TreeScope) => encodeURIComponent(JSON.stringify(scope))

export function decodeScope(header: string | null): TreeScope | null {
  if (!header) return null
  try {
    return parseScope(JSON.parse(decodeURIComponent(header)))
  } catch {
    return null
  }
}

const isId = (x: unknown): x is string => typeof x === 'string' && !!x && x.length <= 100

function parseLine(value: unknown, legacy: boolean): BloodLine | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const gens = (x: unknown) =>
    x === null
      ? null
      : Number.isInteger(x) && (x as number) >= 0 && (x as number) <= MAX_GENERATIONS
      ? (x as number)
      : undefined
  const up = gens(v.up)
  const down = gens(v.down)
  // Parts from before lines always had side lines set; a line may leave them out
  const side = v.side === undefined && !legacy ? 0 : v.side
  if (!isId(v.person) || up === undefined || down === undefined) return null
  if (side !== 0 && side !== 1 && side !== 2 && side !== 3) return null
  return side ? { person: v.person, up, down, side } : { person: v.person, up, down }
}

/**
 * A scope from stored or sent JSON, or null when there is none or it is malformed.
 * Parts from before lines (a single start person with up, down and side) are read
 * as one line, so they cover exactly the same people as before.
 */
export function parseScope(value: unknown): TreeScope | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const legacy = !('lines' in v)
  const raw = legacy ? [v] : v.lines
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_LINES) return null
  const lines: BloodLine[] = []
  for (const r of raw) {
    const line = parseLine(r, legacy)
    if (!line) return null
    if (!lines.some((l) => l.person === line.person)) lines.push(line)
  }
  const ids = (x: unknown, max: number) =>
    x === undefined ? [] : Array.isArray(x) && x.length <= max && x.every(isId) ? [...new Set(x as string[])] : null
  const stops = ids(v.stops, MAX_STOPS)
  const unlock = ids(v.unlock, MAX_EXCEPTIONS)
  const lock = ids(v.lock, MAX_EXCEPTIONS)
  if (!stops || !unlock || !lock) return null
  return { lines, stops, unlock, lock, hideRest: v.hideRest === true }
}

/**
 * - editable: in the part and free to change
 * - locked: in the part, but read-only (see LockReason)
 * - readonly: outside the part, visible because the rest is not hidden
 * - hidden: outside the part, not sent to the member
 */
export type ScopeStatus = 'editable' | 'locked' | 'readonly' | 'hidden'

export type LockReason =
  /** Linked to these people outside the part: family lines hang on them that the member was not given */
  | { kind: 'boundary'; via: string[] }
  /** The part ends here ("up to here"), and these people are beyond */
  | { kind: 'stop'; via: string[] }
  /** Married to a line's person without being a blood relative of any line: their family's member */
  | { kind: 'spouse' }
  /** Locked by hand (an exception) */
  | { kind: 'manual' }

export type ScopeEntry = {
  status: ScopeStatus
  /** The people of the lines this person belongs to by blood */
  lines: string[]
  reason?: LockReason
  /**
   * Only the person's own details may be edited, their relatives not (no one
   * added to them, they cannot be deleted): people at the edge of the part, and
   * anyone limited so by hand
   */
  detailsOnly?: boolean
}

/**
 * Everyone in the tree and what the part gives the member about them. The part is
 * every line with spouses (couples stay together), and each person in it gets one
 * of three levels:
 * - edit: everything, including adding relatives and deleting;
 * - details only: name, dates and photos, for people at the edge of the part,
 *   on whom family lines hang that the member was not given (a grandfather whose
 *   other son is not in the part, a married sister with her own family, a stop
 *   with people beyond); their links to that family stay as they are;
 * - view (status locked): someone who married into a line, and anyone locked by
 *   hand.
 * The moderator can lower anyone (unlock: details only, lock: view), raise
 * someone who married in to details only, and give full rights at the edge by
 * adding that person's line. A line's own person always has full rights. A start
 * person that no longer exists leaves an empty part rather than the whole tree.
 *
 * The edge can only be found in the whole tree: on a view with the rest hidden
 * the links outside are cut, so the client gets these levels from the server.
 */
export function describeScope(tree: Tree, scope: TreeScope): Map<string, ScopeEntry> {
  const ix = buildIndex(tree)
  const out = new Map<string, ScopeEntry>()
  const outside: ScopeStatus = scope.hideRest ? 'hidden' : 'readonly'
  const stop = new Set(scope.stops)
  const lines = ix.byId.has(startOf(scope)) ? scope.lines.filter((l) => ix.byId.has(l.person)) : []
  const owners = new Set(lines.map((l) => l.person))

  const part = new Set<string>()
  const byBlood = new Map<string, string[]>()
  for (const l of lines) {
    const range: LineScope = { up: l.up, down: l.down, side: l.side ?? 0 }
    for (const id of bloodLineOf(ix, l.person, range, stop).blood) {
      byBlood.set(id, [...(byBlood.get(id) ?? []), l.person])
    }
    for (const id of lineageView(ix, l.person, range, stop)) part.add(id)
  }
  const marriedIn = new Set(
    lines.map((l) => spouseOf(ix, l.person)).filter((sp): sp is string => !!sp && !byBlood.has(sp) && !owners.has(sp)),
  )

  for (const id of ix.byId.keys()) {
    const lineIds = byBlood.get(id) ?? []
    if (!part.has(id)) {
      out.set(id, { status: outside, lines: lineIds })
      continue
    }
    if (scope.lock.includes(id) && id !== startOf(scope)) {
      out.set(id, { status: 'locked', lines: lineIds, reason: { kind: 'manual' } })
      continue
    }
    if (owners.has(id)) {
      out.set(id, { status: 'editable', lines: lineIds })
      continue
    }
    const sp = spouseOf(ix, id)
    const via = [...new Set([...parentsOf(ix, id), ...childrenOf(ix, id), ...(sp ? [sp] : [])])].filter(
      (x) => !part.has(x),
    )
    const reason: LockReason | undefined = marriedIn.has(id)
      ? { kind: 'spouse' }
      : via.length
      ? { kind: stop.has(id) ? 'stop' : 'boundary', via }
      : undefined
    const details = scope.unlock.includes(id)
    // Someone who married in belongs to their own family: only to see, unless allowed by hand
    if (reason?.kind === 'spouse' && !details) out.set(id, { status: 'locked', lines: lineIds, reason })
    // At the edge, or limited by hand: their details, never the links to the family beyond
    else if (reason || details) out.set(id, { status: 'editable', lines: lineIds, reason, detailsOnly: true })
    else out.set(id, { status: 'editable', lines: lineIds })
  }
  return out
}

/**
 * Who a member with this scope sees and may edit (describeScope). `locked` holds
 * those locked by hand, marked with a lock; someone who married into a line is
 * not editable either, without a mark. `detailsOnly`: editable people whose
 * relatives are not (at the edge of the part, or limited by hand).
 */
export function scopeSets(
  tree: Tree,
  scope: TreeScope,
): { visible: Set<string>; editable: Set<string>; locked: Set<string>; detailsOnly: Set<string> } {
  const visible = new Set<string>()
  const editable = new Set<string>()
  const locked = new Set<string>()
  const detailsOnly = new Set<string>()
  for (const [id, e] of describeScope(tree, scope)) {
    if (e.status === 'editable' || e.status === 'locked') visible.add(id)
    if (e.status === 'editable') editable.add(id)
    if (e.status === 'locked' && e.reason?.kind !== 'spouse') locked.add(id)
    if (e.detailsOnly) detailsOnly.add(id)
  }
  return { visible, editable, locked, detailsOnly }
}

export type ScopeDiff = {
  /** In the part now, outside it before */
  gained: string[]
  /** More rights than before: details instead of view, or everything instead of details */
  unlocked: string[]
  /** Fewer rights than before, still in the part */
  locked: string[]
  /** In the part before, outside it now */
  lost: string[]
}

/** 0 outside the part, 1 view, 2 details only, 3 everything */
const level = (e?: ScopeEntry) =>
  !e || (e.status !== 'editable' && e.status !== 'locked') ? 0 : e.status === 'locked' ? 1 : e.detailsOnly ? 2 : 3

/** What changes for a member when their part changes from `before` to `after` (null = whole tree) */
export function diffScopes(tree: Tree, before: TreeScope | null, after: TreeScope | null): ScopeDiff {
  const entries = (scope: TreeScope | null): Map<string, ScopeEntry> =>
    scope
      ? describeScope(tree, scope)
      : new Map(Object.keys(tree.members).map((id) => [id, { status: 'editable' as const, lines: [] }]))
  const a = entries(before)
  const b = entries(after)
  const diff: ScopeDiff = { gained: [], unlocked: [], locked: [], lost: [] }
  for (const id of Object.keys(tree.members)) {
    const was = level(a.get(id))
    const now = level(b.get(id))
    if (was === now) continue
    if (!was) diff.gained.push(id)
    else if (!now) diff.lost.push(id)
    else if (now > was) diff.unlocked.push(id)
    else diff.locked.push(id)
  }
  return diff
}

/**
 * Whether a person added as `relation` of `refId` would belong to the part, so the
 * member could still edit them afterwards (a sibling's child is outside a part with
 * siblings only). Tried on a copy, exactly as the form would add them.
 */
export function canAddInPart(tree: Tree, scope: TreeScope, refId: string, relation: Relation): boolean {
  const { editable, detailsOnly } = scopeSets(tree, scope)
  if (!editable.has(refId) || detailsOnly.has(refId)) return false
  try {
    const added = addRelative(tree, refId, { relation, name: '?', gender: 'FEMALE' })
    return scopeSets(added.tree, scope).editable.has(added.id)
  } catch {
    return false
  }
}

/** The tree as this member gets it: the part only when the rest is hidden */
export function viewFor(tree: Tree, scope: TreeScope | null): Tree {
  if (!scope?.hideRest) return tree
  const view = subTree(tree, scopeSets(tree, scope).visible)
  const start = startOf(scope)
  return { ...view, rootId: view.members[start] ? start : view.rootId }
}

/** On the client: the server refused a change outside the member's part */
export class OutsideScopeError extends Error {
  constructor(detail?: string) {
    super(`outside scope${detail ? `: ${detail}` : ''}`)
  }
}

/** On the client: a change tried while a moderator looks at the tree as a member; nothing is saved */
export class PreviewError extends Error {
  constructor() {
    super('preview: nothing is saved')
  }
}

export type ScopedSaveResult = { ok: true; tree: Tree } | { ok: false; error: 'outside scope'; detail: string }

/**
 * Name, gender and profile: what a person is, without their links. Empty fields
 * are left out, so an older stored entry and its cleaned-up copy compare equal.
 */
function core(p: Person): string {
  const profile = Object.entries(p.profile ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length))
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify([p.name, p.gender, profile])
}

/**
 * Applies what a scoped member sent to the stored tree. Everything outside their
 * part comes from the stored tree, whatever was sent:
 * - people in the part: their own data from the sent tree; links to people outside
 *   the part stay exactly as stored (nobody is attached to or cut off from the
 *   rest of the tree);
 * - new people: taken over, linked only within the part; a new child of someone in
 *   the part may also get its other parent from outside the part;
 * - people outside the part and locked people: unchanged; a change to their data
 *   is refused, a person the member can see but not edit cannot be deleted;
 * - a line's person cannot be deleted (their line would vanish with them);
 * - people unlocked by hand keep their relatives: they cannot be deleted, and new
 *   people are not linked to them (only a new child who also has a parent free to
 *   edit, as for a couple).
 */
export function mergeScopedSave(stored: Tree, sent: Tree, scope: TreeScope): ScopedSaveResult {
  const { visible, editable, detailsOnly } = scopeSets(stored, scope)
  const seen = scope.hideRest ? visible : new Set(Object.keys(stored.members))
  const isNew = (id: string) => !stored.members[id]
  const inside = (id: string) => editable.has(id) || (isNew(id) && !!sent.members[id])
  const refuse = (detail: string): ScopedSaveResult => ({ ok: false, error: 'outside scope', detail })

  for (const id of linePeople(scope)) {
    if (stored.members[id] && !sent.members[id]) return refuse(`${id}: a line's person cannot be removed`)
  }
  for (const id of detailsOnly) {
    if (!sent.members[id]) return refuse(`${id}: only their details may be changed, they cannot be removed`)
  }
  for (const id of seen) {
    const was = stored.members[id]
    const now = sent.members[id]
    if (editable.has(id)) continue
    if (!now) return refuse(`${id}: outside the part, cannot be removed`)
    if (core(now) !== core(was)) return refuse(`${id}: outside the part, cannot be changed`)
  }

  const members: Tree['members'] = {}
  // Everyone the member may not edit, as stored
  for (const [id, p] of Object.entries(stored.members)) if (!editable.has(id)) members[id] = p
  // Their part and new people, as sent, with links outside the part as stored
  for (const [id, p] of Object.entries(sent.members)) {
    if (!editable.has(id) && !isNew(id)) continue
    const was = stored.members[id]
    if (was && detailsOnly.has(id)) {
      // Their details as sent, their links exactly as stored
      const { childrenIds, adoptedChildrenIds, spouseId, parentIds } = was
      members[id] = { ...p, childrenIds, adoptedChildrenIds, spouseId, parentIds }
      continue
    }
    const keptOutside = (ids: string[] | undefined) => (ids ?? []).filter((c) => !editable.has(c) && !isNew(c))
    const childrenIds = [
      ...new Set([...(p.childrenIds ?? []).filter(inside), ...(was ? keptOutside(was.childrenIds) : [])]),
    ]
    const adoptedChildrenIds = [
      ...new Set([...(p.adoptedChildrenIds ?? []).filter(inside), ...(was ? keptOutside(was.adoptedChildrenIds) : [])]),
    ].filter((c) => childrenIds.includes(c))
    const storedSpouseOutside = was?.spouseId && !editable.has(was.spouseId) ? was.spouseId : null
    const spouseId = storedSpouseOutside ?? (p.spouseId && inside(p.spouseId) ? p.spouseId : null)
    members[id] = { ...p, childrenIds, adoptedChildrenIds, spouseId }
  }

  // A new child of someone in the part also counts for its other parent outside the
  // part (the start person's spouse): only new people are added to them, nothing else
  const newChildOfPart = (c: string) =>
    isNew(c) &&
    !!sent.members[c] &&
    [...editable].some((pid) => !detailsOnly.has(pid) && sent.members[pid]?.childrenIds?.includes(c))
  for (const id of seen) {
    if ((editable.has(id) && !detailsOnly.has(id)) || !members[id]) continue
    const added = (sent.members[id]?.childrenIds ?? []).filter(newChildOfPart)
    if (added.length) members[id] = { ...members[id], childrenIds: [...(members[id].childrenIds ?? []), ...added] }
  }

  // People of the part the member deleted are gone; drop the links that pointed at them
  const exists = (id: string) => !!members[id]
  for (const [id, p] of Object.entries(members)) {
    const gone = (p.childrenIds ?? []).some((c) => !exists(c)) || (!!p.spouseId && !exists(p.spouseId))
    if (!gone) continue // untouched people stay exactly as stored
    const childrenIds = (p.childrenIds ?? []).filter(exists)
    members[id] = {
      ...p,
      childrenIds,
      adoptedChildrenIds: (p.adoptedChildrenIds ?? []).filter((c) => childrenIds.includes(c)),
      spouseId: p.spouseId && exists(p.spouseId) ? p.spouseId : null,
    }
  }
  // parentIds is derived from the parents' childrenIds, so rebuild it from the result
  const parents = new Map<string, string[]>()
  for (const [id, p] of Object.entries(members))
    for (const c of p.childrenIds ?? []) parents.set(c, [...(parents.get(c) ?? []), id])
  for (const [id, p] of Object.entries(members)) {
    const want = parents.get(id) ?? []
    const have = p.parentIds ?? []
    // Untouched people stay exactly as stored, field for field
    if (want.length !== have.length || want.some((x) => !have.includes(x))) members[id] = { ...p, parentIds: want }
  }
  // A spouse link is mutual: a new spouse in the part also points back
  for (const [id, p] of Object.entries(members)) {
    if (p.spouseId && members[p.spouseId] && !members[p.spouseId].spouseId && inside(p.spouseId)) {
      members[p.spouseId] = { ...members[p.spouseId], spouseId: id }
    }
  }
  // A new person must hang on the part: a loose entry somewhere in the tree is refused
  for (const id of Object.keys(members)) {
    if (!isNew(id)) continue
    const p = members[id]
    const linked = !!p.spouseId || (p.childrenIds ?? []).length > 0 || (p.parentIds ?? []).length > 0
    if (!linked) return refuse(`${id}: a new person must be linked to the part`)
  }
  // and not hang on someone whose relatives the member may not change
  for (const id of Object.keys(members)) {
    if (!isNew(id)) continue
    const p = members[id]
    const free = (x: string) => editable.has(x) && !detailsOnly.has(x)
    const parentOk = (p.parentIds ?? []).some((x) => free(x) || isNew(x))
    const touches = [...(p.parentIds ?? []), ...(p.childrenIds ?? []), ...(p.spouseId ? [p.spouseId] : [])]
    const viaChild = (x: string) => (p.parentIds ?? []).includes(x) && parentOk
    if (touches.some((x) => detailsOnly.has(x) && !viaChild(x))) {
      return refuse(`${id}: no relatives can be added to someone whose details only may be changed`)
    }
  }
  // and stay in it: someone the member could not edit afterwards is refused
  const after = scopeSets({ ...stored, members }, scope).editable
  for (const id of Object.keys(members)) {
    if (isNew(id) && !after.has(id)) return refuse(`${id}: a new person would be outside the part`)
  }
  return { ok: true, tree: { ...stored, members } }
}
