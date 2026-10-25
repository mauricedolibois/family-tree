// src/family/model.ts
//
// The tree as plain data (exactly as stored) plus an index for quick lookups
// such as "who are the parents?". Parent-child links are owned by the parents'
// `childrenIds`; `parentIds` is derived from them.

import type { StoredMemberV3, StoredTree } from '@/storage/schema'

export type Person = StoredMemberV3
export type Tree = StoredTree
export type Gender = Person['gender']

export type TreeIndex = {
  tree: Tree
  byId: Map<string, Person>
  parents: Map<string, string[]>
  children: Map<string, string[]>
  /** Child ids this parent adopted */
  adopted: Map<string, Set<string>>
}

export function buildIndex(tree: Tree): TreeIndex {
  const byId = new Map<string, Person>()
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  const adopted = new Map<string, Set<string>>()

  for (const p of Object.values(tree.members)) {
    byId.set(p.id, p)
    parents.set(p.id, [])
  }
  for (const p of Object.values(tree.members)) {
    const kids = (p.childrenIds ?? []).filter((c) => byId.has(c))
    children.set(p.id, kids)
    adopted.set(p.id, new Set((p.adoptedChildrenIds ?? []).filter((c) => kids.includes(c))))
    for (const c of kids) {
      const list = parents.get(c)!
      if (!list.includes(p.id)) list.push(p.id)
    }
  }
  return { tree, byId, parents, children, adopted }
}

export const parentsOf = (ix: TreeIndex, id: string) => ix.parents.get(id) ?? []
export const childrenOf = (ix: TreeIndex, id: string) => ix.children.get(id) ?? []

export function spouseOf(ix: TreeIndex, id: string): string | null {
  const s = ix.byId.get(id)?.spouseId
  return s && ix.byId.has(s) ? s : null
}

/** Siblings including half-siblings, excluding the person */
export function siblingsOf(ix: TreeIndex, id: string): string[] {
  const out = new Set<string>()
  for (const p of parentsOf(ix, id)) for (const c of childrenOf(ix, p)) if (c !== id) out.add(c)
  return [...out]
}

export function isHalfSibling(ix: TreeIndex, a: string, b: string): boolean {
  const pa = parentsOf(ix, a)
  const pb = parentsOf(ix, b)
  const shared = pa.filter((p) => pb.includes(p)).length
  return shared > 0 && (shared < pa.length || shared < pb.length)
}

/**
 * Ancestors with their distance in generations (parents = 1). People in `stop` are
 * included, but nothing beyond them.
 */
export function ancestorsOf(ix: TreeIndex, id: string, stop?: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>()
  let frontier = [id]
  for (let gen = 1; frontier.length; gen++) {
    const next: string[] = []
    for (const f of frontier)
      for (const p of parentsOf(ix, f)) {
        if (out.has(p) || p === id) continue
        out.set(p, gen)
        if (!stop?.has(p)) next.push(p)
      }
    frontier = next
  }
  return out
}

/**
 * Descendants with their distance in generations (children = 1). People in `stop`
 * are included, but nothing beyond them.
 */
export function descendantsOf(ix: TreeIndex, id: string, stop?: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>()
  let frontier = [id]
  for (let gen = 1; frontier.length; gen++) {
    const next: string[] = []
    for (const f of frontier)
      for (const c of childrenOf(ix, f)) {
        if (out.has(c) || c === id) continue
        out.set(c, gen)
        if (!stop?.has(c)) next.push(c)
      }
    frontier = next
  }
  return out
}

/** Direct line of a person: the person, their spouse, all ancestors and descendants */
export function lineageOf(ix: TreeIndex, id: string): Set<string> {
  const set = new Set<string>([id, ...ancestorsOf(ix, id).keys(), ...descendantsOf(ix, id).keys()])
  const sp = spouseOf(ix, id)
  if (sp) set.add(sp)
  return set
}

/**
 * How far the "line of …" view reaches.
 * `up`/`down`: generations above/below, null = all.
 * `side`: collateral lines. 0 none, 1 siblings (also uncles, aunts, great-uncles …),
 * 2 plus their children (nephews, cousins …), 3 all blood relatives.
 */
export type LineScope = { up: number | null; down: number | null; side: 0 | 1 | 2 | 3 }

export const DEFAULT_LINE_SCOPE: LineScope = { up: null, down: null, side: 0 }

/** How many generations exist above and below a person */
export function lineDepth(ix: TreeIndex, id: string): { up: number; down: number } {
  const max = (m: Map<string, number>) => Math.max(0, ...m.values())
  return { up: max(ancestorsOf(ix, id)), down: max(descendantsOf(ix, id)) }
}

/**
 * The blood relatives of a "line of …" view: the direct line within the chosen
 * scope and optional collateral lines, without anyone who married in. People in
 * `stop` are included, but the line goes no further past them.
 */
export function bloodLineOf(
  ix: TreeIndex,
  id: string,
  scope: LineScope = DEFAULT_LINE_SCOPE,
  stop?: ReadonlySet<string>,
): { blood: Set<string>; descendants: string[] } {
  const within = (d: number, max: number | null) => max === null || d <= max
  const ancestors = [...ancestorsOf(ix, id, stop)].filter(([, d]) => within(d, scope.up)).map(([a]) => a)
  const descendants = [...descendantsOf(ix, id, stop)].filter(([, d]) => within(d, scope.down)).map(([c]) => c)
  const blood = new Set<string>([id, ...ancestors, ...descendants])

  // Collateral lines branch off at the shown ancestors: their other children are
  // the line's siblings, whose children are nephews, cousins and so on.
  if (scope.side > 0) {
    const sideDepth = scope.side === 3 ? Infinity : scope.side
    const beyond = (x: string) => (stop?.has(x) ? [] : childrenOf(ix, x))
    const line = new Set([id, ...ancestorsOf(ix, id, stop).keys()])
    for (const a of ancestors) {
      let frontier = beyond(a).filter((c) => !line.has(c))
      for (let gen = 1; gen <= sideDepth && frontier.length; gen++) {
        frontier.forEach((c) => blood.add(c))
        frontier = frontier.flatMap(beyond).filter((c) => !blood.has(c))
      }
    }
  }
  return { blood, descendants }
}

/**
 * People shown in the "line of …" view: the blood line (bloodLineOf) and the
 * spouses of everyone in it, so that couples stay complete, in side lines too (a
 * sister with her husband).
 */
export function lineageView(
  ix: TreeIndex,
  id: string,
  scope: LineScope = DEFAULT_LINE_SCOPE,
  stop?: ReadonlySet<string>,
): Set<string> {
  const { blood } = bloodLineOf(ix, id, scope, stop)
  const set = new Set(blood)
  // Spouses of everyone in the line, and the other parent of any shown child
  for (const x of blood) {
    const sp = spouseOf(ix, x)
    if (sp) set.add(sp)
  }
  for (const x of [...set]) {
    const ps = parentsOf(ix, x)
    if (ps.some((p) => set.has(p))) ps.forEach((p) => set.add(p))
  }
  return set
}

/** Subtree with only these people; links to anyone outside are dropped */
export function subTree(tree: Tree, keep: Set<string>): Tree {
  const members: Tree['members'] = {}
  for (const id of keep) {
    const p = tree.members[id]
    if (!p) continue
    const childrenIds = (p.childrenIds ?? []).filter((c) => keep.has(c))
    members[id] = {
      ...p,
      spouseId: p.spouseId && keep.has(p.spouseId) ? p.spouseId : null,
      parentIds: (p.parentIds ?? []).filter((x) => keep.has(x)),
      childrenIds,
      adoptedChildrenIds: (p.adoptedChildrenIds ?? []).filter((c) => childrenIds.includes(c)),
    }
  }
  const rootId = keep.has(tree.rootId) ? tree.rootId : Object.keys(members)[0]
  return { version: 3, rootId, members }
}
