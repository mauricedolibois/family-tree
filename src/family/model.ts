// src/family/model.ts
//
// Der Stammbaum als schlichte Daten (so wie er gespeichert wird) plus ein
// Index für schnelle Fragen wie „Wer sind die Eltern?“. Quelle der Wahrheit
// für Eltern-Kind-Beziehungen sind die `childrenIds` der Eltern.

import type { StoredMemberV3, StoredTree } from '@/storage/schema'

export type Person = StoredMemberV3
export type Tree = StoredTree
export type Gender = Person['gender']

export type TreeIndex = {
  tree: Tree
  byId: Map<string, Person>
  parents: Map<string, string[]>
  children: Map<string, string[]>
  /** Kind-IDs, die von diesem Elternteil adoptiert wurden */
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

/** Geschwister (auch Halbgeschwister), ohne die Person selbst */
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

/** Vorfahren mit Abstand in Generationen (Eltern = 1) */
export function ancestorsOf(ix: TreeIndex, id: string): Map<string, number> {
  const out = new Map<string, number>()
  let frontier = [id]
  for (let gen = 1; frontier.length; gen++) {
    const next: string[] = []
    for (const f of frontier)
      for (const p of parentsOf(ix, f)) {
        if (out.has(p) || p === id) continue
        out.set(p, gen)
        next.push(p)
      }
    frontier = next
  }
  return out
}

/** Nachkommen mit Abstand in Generationen (Kinder = 1) */
export function descendantsOf(ix: TreeIndex, id: string): Map<string, number> {
  const out = new Map<string, number>()
  let frontier = [id]
  for (let gen = 1; frontier.length; gen++) {
    const next: string[] = []
    for (const f of frontier)
      for (const c of childrenOf(ix, f)) {
        if (out.has(c) || c === id) continue
        out.set(c, gen)
        next.push(c)
      }
    frontier = next
  }
  return out
}

/** Direkte Linie einer Person: sie selbst, Partner, alle Vorfahren und Nachkommen */
export function lineageOf(ix: TreeIndex, id: string): Set<string> {
  const set = new Set<string>([id, ...ancestorsOf(ix, id).keys(), ...descendantsOf(ix, id).keys()])
  const sp = spouseOf(ix, id)
  if (sp) set.add(sp)
  return set
}

/**
 * Personen für die Ansicht „Linie von …“: die direkte Linie, dazu Geschwister
 * der Person und die Partner aller Nachkommen, damit Paare vollständig bleiben.
 */
export function lineageView(ix: TreeIndex, id: string): Set<string> {
  const set = lineageOf(ix, id)
  for (const s of siblingsOf(ix, id)) set.add(s)
  for (const d of descendantsOf(ix, id).keys()) {
    const sp = spouseOf(ix, d)
    if (sp) set.add(sp)
  }
  return set
}

/** Teilbaum mit nur diesen Personen (Verweise nach außen werden gekappt) */
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

/** Häufigstes Land im Baum (um Abweichungen hervorzuheben) */
export function mostCommonCountry(tree: Tree): string | null {
  const counts = new Map<string, number>()
  for (const p of Object.values(tree.members)) {
    const c = p.profile?.country?.trim()
    if (c) counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1)
  }
  let best: string | null = null
  let max = 0
  for (const [c, n] of counts) if (n > max) [best, max] = [c, n]
  return best
}
