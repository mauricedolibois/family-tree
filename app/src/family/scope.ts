// src/family/scope.ts
// A member's part of the tree: a start person with ancestors, descendants and side
// lines, as in "only this line". Members with a part edit only that part and, if
// set so, see only that part. The server cuts what it sends with viewFor and
// checks every save with mergeScopedSave; the client uses scopeSets to show edit
// buttons only where saving would be accepted.

import { addRelative, type Relation } from './edit'
import { buildIndex, lineageView, spouseOf, subTree, type LineScope, type Person, type Tree } from './model'

export type TreeScope = LineScope & {
  /** Start person (a member id in the tree) */
  person: string
  /** true: everyone outside the part is hidden; false: visible, read-only */
  hideRest: boolean
}

const MAX_GENERATIONS = 20

/** Response header with the member's scope (URI-encoded JSON), absent for the whole tree */
export const TREE_SCOPE_HEADER = 'x-tree-scope'

export const encodeScope = (scope: TreeScope) => encodeURIComponent(JSON.stringify(scope))

export function decodeScope(header: string | null): TreeScope | null {
  if (!header) return null
  try {
    return parseScope(JSON.parse(decodeURIComponent(header)))
  } catch {
    return null
  }
}

/** A scope from stored or sent JSON, or null when there is none or it is malformed */
export function parseScope(value: unknown): TreeScope | null {
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
  const side = v.side
  if (typeof v.person !== 'string' || !v.person || v.person.length > 100) return null
  if (up === undefined || down === undefined) return null
  if (side !== 0 && side !== 1 && side !== 2 && side !== 3) return null
  return { person: v.person, up, down, side, hideRest: v.hideRest === true }
}

/**
 * Who a member with this scope sees and may edit. The start person's own spouse is
 * shown (the couple belongs together) but not editable: for someone who married
 * in, that is a member of the main family. A start person that no longer exists
 * leaves an empty part rather than the whole tree.
 */
export function scopeSets(tree: Tree, scope: TreeScope): { visible: Set<string>; editable: Set<string> } {
  const ix = buildIndex(tree)
  if (!ix.byId.has(scope.person)) return { visible: new Set(), editable: new Set() }
  const visible = lineageView(ix, scope.person, scope)
  const editable = new Set(visible)
  const spouse = spouseOf(ix, scope.person)
  if (spouse) editable.delete(spouse)
  return { visible, editable }
}

/**
 * Whether a person added as `relation` of `refId` would belong to the part, so the
 * member could still edit them afterwards (a sibling's child is outside a part with
 * siblings only). Tried on a copy, exactly as the form would add them.
 */
export function canAddInPart(tree: Tree, scope: TreeScope, refId: string, relation: Relation): boolean {
  if (!scopeSets(tree, scope).editable.has(refId)) return false
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
  return { ...view, rootId: view.members[scope.person] ? scope.person : view.rootId }
}

/** On the client: the server refused a change outside the member's part */
export class OutsideScopeError extends Error {
  constructor(detail?: string) {
    super(`outside scope${detail ? `: ${detail}` : ''}`)
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
 * - people outside the part: unchanged; a change to their data is refused, a
 *   person the member can see but not edit cannot be deleted;
 * - the start person cannot be deleted (the part would vanish with them).
 */
export function mergeScopedSave(stored: Tree, sent: Tree, scope: TreeScope): ScopedSaveResult {
  const { visible, editable } = scopeSets(stored, scope)
  const seen = scope.hideRest ? visible : new Set(Object.keys(stored.members))
  const isNew = (id: string) => !stored.members[id]
  const inside = (id: string) => editable.has(id) || (isNew(id) && !!sent.members[id])
  const refuse = (detail: string): ScopedSaveResult => ({ ok: false, error: 'outside scope', detail })

  if (!sent.members[scope.person]) return refuse('the start person cannot be removed')
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
    isNew(c) && !!sent.members[c] && [...editable].some((pid) => sent.members[pid]?.childrenIds?.includes(c))
  for (const id of seen) {
    if (editable.has(id) || !members[id]) continue
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
  // and stay in it: someone the member could not edit afterwards is refused
  const after = scopeSets({ ...stored, members }, scope).editable
  for (const id of Object.keys(members)) {
    if (isNew(id) && !after.has(id)) return refuse(`${id}: a new person would be outside the part`)
  }
  return { ok: true, tree: { ...stored, members } }
}
