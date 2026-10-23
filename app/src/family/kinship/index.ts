// src/family/kinship/index.ts
//
// "How are we related?" Describes one person from another's point of view and
// finds the path between them through the tree. The result is language-neutral;
// ./words/ turns it into German, English, French or Spanish.

import { ancestorsOf, childrenOf, isHalfSibling, parentsOf, spouseOf, type Gender, type TreeIndex } from '../model'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import { hasNote, type Connection, type KinStep, type Kinship, type Party, type Rel } from './types'
import { WORDS } from './words'

export * from './types'

/** Up to the great-great-great generation; beyond that generations are counted */
export const MAX_NAMED_GREATS = 3

function kin(rel: Rel, gender: Gender, byMarriage = false, via: KinStep[] = []): Kinship {
  return { rel, gender, byMarriage, via }
}

/** Distance from a person to each ancestor, including the person itself (0) */
function withSelf(ix: TreeIndex, id: string) {
  const m = ancestorsOf(ix, id)
  m.set(id, 0)
  return m
}

/** Closest common ancestors: steps up from A and from B, and who they are */
type Common = { up: number; down: number; ids: string[] }

function closestCommon(ix: TreeIndex, a: string, b: string): Common | null {
  const ancA = withSelf(ix, a)
  const ancB = withSelf(ix, b)
  let best: Common | null = null
  for (const [id, da] of ancA) {
    const db = ancB.get(id)
    if (db === undefined) continue
    if (
      !best ||
      da + db < best.up + best.down ||
      (da + db === best.up + best.down && Math.max(da, db) < Math.max(best.up, best.down))
    ) {
      best = { up: da, down: db, ids: [id] }
    } else if (da === best.up && db === best.down) {
      best.ids.push(id)
    }
  }
  return best
}

/** Blood relation of B as seen from A, or null */
function bloodRel(ix: TreeIndex, a: string, b: string, common = closestCommon(ix, a, b)): Rel | null {
  if (!ix.byId.has(b) || !common) return null
  const { up, down } = common
  if (up === 0 && down === 0) return null

  // B is an ancestor of A
  if (down === 0) {
    if (up === 1) return { kind: 'parent' }
    if (up - 2 <= MAX_NAMED_GREATS) return { kind: 'grandparent', greats: up - 2 }
    return { kind: 'ancestor', generations: up }
  }

  // B is a descendant of A
  if (up === 0) {
    if (down === 1) return { kind: 'child' }
    if (down - 2 <= MAX_NAMED_GREATS) return { kind: 'grandchild', greats: down - 2 }
    return { kind: 'descendant', generations: down }
  }

  if (up === 1 && down === 1) return { kind: 'sibling', half: isHalfSibling(ix, a, b) }

  // Nephew/niece and further down
  if (up === 1) {
    if (down - 3 <= MAX_NAMED_GREATS) return { kind: 'nibling', greats: down - 2 }
    return { kind: 'niblingDescendant' }
  }

  // Uncle/aunt and further up
  if (down === 1) {
    if (up - 3 <= MAX_NAMED_GREATS) return { kind: 'pibling', greats: up - 2 }
    return { kind: 'piblingAncestor', generations: up - 1 }
  }

  return { kind: 'cousin', degree: Math.min(up, down) - 1, removed: Math.abs(up - down) }
}

/** From a person up through their parents to an ancestor: [from, …, to] */
function climb(ix: TreeIndex, from: string, to: string): string[] {
  const prev = new Map<string, string | null>([[from, null]])
  let frontier = [from]
  while (frontier.length && !prev.has(to)) {
    const next: string[] = []
    for (const f of frontier)
      for (const p of parentsOf(ix, f))
        if (!prev.has(p)) {
          prev.set(p, f)
          next.push(p)
        }
    frontier = next
  }
  if (!prev.has(to)) return [from, to]
  const path: string[] = []
  for (let cur: string | null = to; cur !== null; cur = prev.get(cur) ?? null) path.push(cur)
  return path.reverse()
}

/** Path A → common ancestor → B; prefers an ancestor whose spouse is a common ancestor too */
function bloodPath(ix: TreeIndex, a: string, b: string, c: Common) {
  const top =
    c.ids.find((id) => {
      const s = spouseOf(ix, id)
      return !!s && c.ids.includes(s)
    }) ?? c.ids[0]
  const fromA = climb(ix, a, top)
  const fromB = climb(ix, b, top)
  const path = [...fromA, ...fromB.slice(0, -1).reverse()]
  const partner = spouseOf(ix, top)
  const common = c.up > 0 && c.down > 0 ? [top, ...(partner && c.ids.includes(partner) ? [partner] : [])] : []
  return { path, common }
}

type Found = { kinship: Kinship; path: string[]; common: string[] }

/** Named relation of B as seen from A, with the path through the tree */
function relate(ix: TreeIndex, a: string, b: string): Found | null {
  if (a === b) return null
  const other = ix.byId.get(b)
  if (!other || !ix.byId.has(a)) return null
  const g = other.gender

  if (spouseOf(ix, a) === b) return { kinship: kin({ kind: 'spouse' }, g, true), path: [a, b], common: [] }

  const blood = closestCommon(ix, a, b)
  const rel = blood && bloodRel(ix, a, b, blood)
  if (blood && rel) return { kinship: kin(rel, g), ...bloodPath(ix, a, b, blood) }

  // B is married to a blood relative of A
  const otherSpouse = spouseOf(ix, b)
  const viaOtherSpouse = otherSpouse ? closestCommon(ix, a, otherSpouse) : null
  if (otherSpouse && viaOtherSpouse) {
    const { up, down } = viaOtherSpouse
    const route = bloodPath(ix, a, otherSpouse, viaOtherSpouse)
    const found = (k: Kinship): Found => ({ kinship: k, path: [...route.path, b], common: route.common })
    if (up === 0 && down === 1) return found(kin({ kind: 'childInLaw' }, g, true))
    if (up === 1 && down === 0) return found(kin({ kind: 'stepParent' }, g, true))
    if (up === 1 && down === 1) return found(kin({ kind: 'siblingInLaw' }, g, true))
    const spouseRel = bloodRel(ix, a, otherSpouse, viaOtherSpouse)
    if (spouseRel && down === 1 && up >= 2) return found(kin({ kind: 'byMarriage', of: spouseRel }, g, true))
    if (spouseRel && !hasNote(spouseRel)) {
      const sg = ix.byId.get(otherSpouse)!.gender
      return found(kin({ kind: 'spouse' }, g, true, [{ rel: spouseRel, gender: sg }]))
    }
  }

  // B is a blood relative of A's spouse
  const mySpouse = spouseOf(ix, a)
  const viaMySpouse = mySpouse ? closestCommon(ix, mySpouse, b) : null
  if (mySpouse && viaMySpouse) {
    const { up, down } = viaMySpouse
    const route = bloodPath(ix, mySpouse, b, viaMySpouse)
    const found = (k: Kinship): Found => ({ kinship: k, path: [a, ...route.path], common: route.common })
    if (down === 0 && up === 1) return found(kin({ kind: 'parentInLaw' }, g, true))
    if (up === 1 && down === 1) return found(kin({ kind: 'siblingInLaw' }, g, true))
    if (up === 0 && down === 1) return found(kin({ kind: 'stepChild' }, g, true))
    const r = bloodRel(ix, mySpouse, b, viaMySpouse)
    if (r) {
      const sg = ix.byId.get(mySpouse)!.gender
      return found(kin(r, g, true, [{ rel: { kind: 'partner' }, gender: sg }]))
    }
  }

  return null
}

/**
 * Describes `otherId` as seen from `meId`.
 * Returns null for the same person or when there is no common term.
 */
export function describeKinship(ix: TreeIndex, meId: string, otherId: string): Kinship | null {
  return relate(ix, meId, otherId)?.kinship ?? null
}

/** Shortest path via parents, children and spouses, or null if unconnected */
export function shortestPath(ix: TreeIndex, a: string, b: string): string[] | null {
  if (!ix.byId.has(a) || !ix.byId.has(b)) return null
  const prev = new Map<string, string | null>([[a, null]])
  let frontier = [a]
  while (frontier.length && !prev.has(b)) {
    const next: string[] = []
    for (const f of frontier) {
      const sp = spouseOf(ix, f)
      for (const n of [...parentsOf(ix, f), ...childrenOf(ix, f), ...(sp ? [sp] : [])])
        if (!prev.has(n)) {
          prev.set(n, f)
          next.push(n)
        }
    }
    frontier = next
  }
  if (!prev.has(b)) return null
  const path: string[] = []
  for (let cur: string | null = b; cur !== null; cur = prev.get(cur) ?? null) path.push(cur)
  return path.reverse()
}

/** Name a path step by step: the husband of the sister of the husband */
function chainKinship(ix: TreeIndex, path: string[]): Kinship {
  const steps: KinStep[] = []
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const cur = path[i]
    const next = path[i + 1]
    const g = ix.byId.get(cur)!.gender
    const isParent = parentsOf(ix, prev).includes(cur)
    // Up to a parent and straight down to their child: a sibling
    if (isParent && next && childrenOf(ix, cur).includes(next)) {
      steps.push({ rel: { kind: 'sibling', half: isHalfSibling(ix, prev, next) }, gender: ix.byId.get(next)!.gender })
      i++
    } else if (isParent) steps.push({ rel: { kind: 'parent' }, gender: g })
    else if (childrenOf(ix, prev).includes(cur)) steps.push({ rel: { kind: 'child' }, gender: g })
    else steps.push({ rel: { kind: 'spouse' }, gender: g })
  }
  const [last, ...rest] = steps.reverse()
  return { ...last, byMarriage: true, via: rest }
}

/**
 * How are A and B connected? Terms in both directions plus the path through
 * the tree. Without a common term the shortest path is described step by step.
 * null if they are not connected at all.
 */
export function findConnection(ix: TreeIndex, a: string, b: string): Connection | null {
  if (a === b || !ix.byId.has(a) || !ix.byId.has(b)) return null
  const found = relate(ix, a, b)
  if (found) {
    const back = relate(ix, b, a)?.kinship ?? chainKinship(ix, [...found.path].reverse())
    return { kinship: found.kinship, reverse: back, path: found.path, common: found.common, detour: null }
  }
  const path = shortestPath(ix, a, b)
  if (!path) return null
  return {
    kinship: chainKinship(ix, path),
    reverse: chainKinship(ix, [...path].reverse()),
    path,
    common: [],
    detour: path.length - 2,
  }
}

// ── Putting it into words ────────────────────────────────────────────────────

/** From your point of view, e.g. on the info sheet: "Dein Urgroßvater", "Your great-grandfather" */
export function kinshipLabel(k: Kinship, locale: Locale = DEFAULT_LOCALE): string {
  return WORDS[locale].label(k)
}

/** Without reference to anyone, as a heading: "Cousin 2. Grades" + "eine Generation versetzt" */
export function kinshipTitle(k: Kinship, locale: Locale = DEFAULT_LOCALE): { title: string; note: string } {
  return WORDS[locale].title(k)
}

/** Full sentence with B as subject and A as object: "Ida ist die Tante von Kurt." */
export function kinshipSentence(k: Kinship, subject: Party, object: Party, locale: Locale = DEFAULT_LOCALE): string {
  return WORDS[locale].sentence(k, subject, object)
}
