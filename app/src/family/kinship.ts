// src/family/kinship.ts
//
// "How are we related?" Describes one person from another's point of view
// using the usual German kinship terms, and finds the path between them.

import { ancestorsOf, childrenOf, isHalfSibling, parentsOf, spouseOf, type Gender, type TreeIndex } from './model'

/** A kinship word and the gender of the person it refers to */
export type KinWord = { term: string; gender: Gender }

export type Kinship = KinWord & {
  /** related by marriage rather than descent */
  byMarriage: boolean
  /**
   * People in between, read from B towards A:
   * "Ehemann [der Cousine]", "Tochter [des Bruders] [des Ehemanns]"
   */
  via: KinWord[]
}

export type Connection = {
  /** B as seen from A */
  kinship: Kinship
  /** A as seen from B */
  reverse: Kinship
  /** Everyone on the path from A to B */
  path: string[]
  /** Closest common ancestors (a couple or one person); empty if one descends from the other or for in-laws */
  common: string[]
  /** When there is no common term: number of people between A and B */
  detour: number | null
}

const MAX_NAMED_UR = 3 // up to "Urururgroßvater", beyond that count generations

function pick(gender: Gender, male: string, female: string) {
  return gender === 'FEMALE' ? female : male
}

function kin(term: string, gender: Gender, byMarriage = false, via: KinWord[] = []): Kinship {
  return { term, gender, byMarriage, via }
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

function urPrefix(n: number) {
  return 'Ur'.repeat(n)
}

/** withUr(2, 'Großonkel') → "Ururgroßonkel" */
function withUr(n: number, word: string) {
  return n === 0 ? word : urPrefix(n) + word.charAt(0).toLowerCase() + word.slice(1)
}

/** Blood relation: term for B as seen from A, or null */
function bloodTerm(ix: TreeIndex, a: string, b: string, common = closestCommon(ix, a, b)): string | null {
  const person = ix.byId.get(b)
  if (!person || !common) return null
  const g = person.gender
  const { up, down } = common

  if (up === 0 && down === 0) return null

  // B is an ancestor of A
  if (down === 0) {
    if (up === 1) return pick(g, 'Vater', 'Mutter')
    if (up === 2) return pick(g, 'Großvater', 'Großmutter')
    if (up - 2 <= MAX_NAMED_UR) return urPrefix(up - 2) + pick(g, 'großvater', 'großmutter')
    return `${pick(g, 'Vorfahr', 'Vorfahrin')}, ${up} Generationen zurück`
  }

  // B is a descendant of A
  if (up === 0) {
    if (down === 1) return pick(g, 'Sohn', 'Tochter')
    if (down === 2) return pick(g, 'Enkel', 'Enkelin')
    if (down - 2 <= MAX_NAMED_UR) return urPrefix(down - 2) + pick(g, 'enkel', 'enkelin')
    return `${pick(g, 'Nachfahre', 'Nachfahrin')}, ${down} Generationen später`
  }

  if (up === 1 && down === 1) {
    return isHalfSibling(ix, a, b) ? pick(g, 'Halbbruder', 'Halbschwester') : pick(g, 'Bruder', 'Schwester')
  }

  // Nephew/niece and further down
  if (up === 1) {
    if (down === 2) return pick(g, 'Neffe', 'Nichte')
    if (down - 3 <= MAX_NAMED_UR) return withUr(down - 3, pick(g, 'Großneffe', 'Großnichte'))
    return `${pick(g, 'Nachfahre', 'Nachfahrin')} eines Geschwisters`
  }

  // Uncle/aunt and further up
  if (down === 1) {
    if (up === 2) return pick(g, 'Onkel', 'Tante')
    if (up - 3 <= MAX_NAMED_UR) return withUr(up - 3, pick(g, 'Großonkel', 'Großtante'))
    return `${pick(g, 'Onkel', 'Tante')}, ${up - 1} Generationen zurück`
  }

  // nth cousin, possibly removed by some generations
  const degree = Math.min(up, down) - 1
  const removed = Math.abs(up - down)
  const base = pick(g, 'Cousin', 'Cousine')
  const named = degree === 1 ? base : `${base} ${degree}. Grades`
  if (removed === 0) return named
  return `${named}, ${removed === 1 ? 'eine Generation' : `${removed} Generationen`} versetzt`
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

  if (spouseOf(ix, a) === b) return { kinship: kin(pick(g, 'Ehemann', 'Ehefrau'), g, true), path: [a, b], common: [] }

  const blood = closestCommon(ix, a, b)
  const term = blood && bloodTerm(ix, a, b, blood)
  if (blood && term) return { kinship: kin(term, g), ...bloodPath(ix, a, b, blood) }

  // B is married to a blood relative of A
  const otherSpouse = spouseOf(ix, b)
  const viaOtherSpouse = otherSpouse ? closestCommon(ix, a, otherSpouse) : null
  if (otherSpouse && viaOtherSpouse) {
    const { up, down } = viaOtherSpouse
    const route = bloodPath(ix, a, otherSpouse, viaOtherSpouse)
    const found = (k: Kinship): Found => ({ kinship: k, path: [...route.path, b], common: route.common })
    if (up === 0 && down === 1) return found(kin(pick(g, 'Schwiegersohn', 'Schwiegertochter'), g, true))
    if (up === 1 && down === 0) return found(kin(pick(g, 'Stiefvater', 'Stiefmutter'), g, true))
    if (up === 1 && down === 1) return found(kin(pick(g, 'Schwager', 'Schwägerin'), g, true))
    const spouseTerm = bloodTerm(ix, a, otherSpouse, viaOtherSpouse)
    if (spouseTerm && down === 1 && up >= 2) return found(kin(`${swapGender(spouseTerm, g)} (angeheiratet)`, g, true))
    if (spouseTerm && !spouseTerm.includes(',')) {
      const sg = ix.byId.get(otherSpouse)!.gender
      return found(kin(pick(g, 'Ehemann', 'Ehefrau'), g, true, [{ term: spouseTerm, gender: sg }]))
    }
  }

  // B is a blood relative of A's spouse
  const mySpouse = spouseOf(ix, a)
  const viaMySpouse = mySpouse ? closestCommon(ix, mySpouse, b) : null
  if (mySpouse && viaMySpouse) {
    const { up, down } = viaMySpouse
    const route = bloodPath(ix, mySpouse, b, viaMySpouse)
    const found = (k: Kinship): Found => ({ kinship: k, path: [a, ...route.path], common: route.common })
    if (down === 0 && up === 1) return found(kin(pick(g, 'Schwiegervater', 'Schwiegermutter'), g, true))
    if (up === 1 && down === 1) return found(kin(pick(g, 'Schwager', 'Schwägerin'), g, true))
    if (up === 0 && down === 1) return found(kin(pick(g, 'Stiefsohn', 'Stieftochter'), g, true))
    const t = bloodTerm(ix, mySpouse, b, viaMySpouse)
    if (t) {
      const sg = ix.byId.get(mySpouse)!.gender
      return found(kin(t, g, true, [{ term: pick(sg, 'Mann', 'Frau'), gender: sg }]))
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

/** Name a path step by step: "Ehemann der Schwester des Ehemanns" */
function chainKinship(ix: TreeIndex, path: string[]): Kinship {
  const words: KinWord[] = []
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const cur = path[i]
    const next = path[i + 1]
    const g = ix.byId.get(cur)!.gender
    const isParent = parentsOf(ix, prev).includes(cur)
    // Up to a parent and straight down to their child: a sibling
    if (isParent && next && childrenOf(ix, cur).includes(next)) {
      const ng = ix.byId.get(next)!.gender
      const half = isHalfSibling(ix, prev, next)
      words.push({ term: half ? pick(ng, 'Halbbruder', 'Halbschwester') : pick(ng, 'Bruder', 'Schwester'), gender: ng })
      i++
    } else if (isParent) words.push({ term: pick(g, 'Vater', 'Mutter'), gender: g })
    else if (childrenOf(ix, prev).includes(cur)) words.push({ term: pick(g, 'Sohn', 'Tochter'), gender: g })
    else words.push({ term: pick(g, 'Ehemann', 'Ehefrau'), gender: g })
  }
  const [last, ...rest] = words.reverse()
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

/** "Onkel" ↔ "Tante" etc. when the in-law has the other gender */
function swapGender(term: string, g: Gender): string {
  const pairs: Array<[string, string]> = [
    ['onkel', 'tante'],
    ['Onkel', 'Tante'],
  ]
  for (const [m, f] of pairs) {
    if (g === 'FEMALE' && term.includes(m)) return term.replace(m, f)
    if (g === 'MALE' && term.includes(f)) return term.replace(f, m)
  }
  return term
}

// ── Putting it into words ────────────────────────────────────────────────────

const article = (g: Gender) => pick(g, 'der', 'die')
const ofArticle = (g: Gender) => pick(g, 'des', 'der')
const your = (g: Gender) => pick(g, 'dein', 'deine')
const ofYour = (g: Gender) => pick(g, 'deines', 'deiner')

const IRREGULAR_GENITIVE: Record<string, string> = { Mann: 'Mannes', Sohn: 'Sohnes' }

/** "des Cousins 2. Grades", "des Neffen", "der Cousine": the word only, without article */
function genitive({ term, gender }: KinWord): string {
  if (gender === 'FEMALE') return term
  const [first, ...rest] = term.split(' ')
  const gen = IRREGULAR_GENITIVE[first] ?? (/e$/.test(first) ? `${first}n` : /[sßx]$/.test(first) ? first : `${first}s`)
  return [gen, ...rest].join(' ')
}

/** "Cousin 2. Grades, eine Generation versetzt" → head and suffix */
function splitTerm(term: string): [string, string] {
  const i = term.indexOf(', ')
  return i < 0 ? [term, ''] : [term.slice(0, i), term.slice(i + 2)]
}

/** "der Schwester des Ehemanns"; with `yours` the last person belongs to "you" */
function viaChain(via: KinWord[], yours: boolean): string {
  return via
    .map((v, i) => `${yours && i === via.length - 1 ? ofYour(v.gender) : ofArticle(v.gender)} ${genitive(v)}`)
    .join(' ')
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** From your point of view, e.g. on the info sheet: "Dein Urgroßvater", "Ehemann deiner Cousine" */
export function kinshipLabel(k: Kinship): string {
  const [head, tail] = splitTerm(k.term)
  const core = k.via.length ? `${head} ${viaChain(k.via, true)}` : `${capitalize(your(k.gender))} ${head}`
  return tail ? `${core}, ${tail}` : core
}

/** Without reference to anyone, as a heading: "Cousin 2. Grades" + "eine Generation versetzt" */
export function kinshipTitle(k: Kinship): { title: string; note: string } {
  const [head, tail] = splitTerm(k.term)
  return { title: k.via.length ? `${head} ${viaChain(k.via, false)}` : head, note: tail }
}

/** A named person or "you" */
export type Party = { name: string } | 'you'

/**
 * Full sentence with B as subject and A as object:
 * "Ida ist die Tante von Kurt.", "Ida ist deine Tante.", "Du bist die Tante von Kurt."
 */
export function kinshipSentence(k: Kinship, subject: Party, object: Party): string {
  const [head, tail] = splitTerm(k.term)
  const start = subject === 'you' ? 'Du bist' : `${subject.name} ist`
  let rel: string
  if (object === 'you') {
    rel = k.via.length ? `${article(k.gender)} ${head} ${viaChain(k.via, true)}` : `${your(k.gender)} ${head}`
  } else {
    const chain = k.via.length ? ` ${viaChain(k.via, false)}` : ''
    rel = `${article(k.gender)} ${head}${chain} von ${object.name}`
  }
  return `${start} ${rel}${tail ? `, ${tail}` : ''}.`
}
