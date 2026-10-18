// src/family/kinship.ts
//
// „Wie sind wir verwandt?“ – beschreibt eine Person aus Sicht einer anderen
// mit den üblichen deutschen Verwandtschaftsbezeichnungen und findet den Weg
// zwischen beiden durch den Baum.

import { ancestorsOf, childrenOf, isHalfSibling, parentsOf, spouseOf, type Gender, type TreeIndex } from './model'

/** Ein Verwandtschaftswort und das Geschlecht der Person, die es bezeichnet */
export type KinWord = { term: string; gender: Gender }

export type Kinship = KinWord & {
  /** über Heirat statt Abstammung */
  byMarriage: boolean
  /**
   * Personen dazwischen, von B aus in Richtung A gelesen:
   * „Ehemann [der Cousine]“, „Tochter [des Bruders] [des Ehemanns]“
   */
  via: KinWord[]
}

export type Connection = {
  /** B aus Sicht von A */
  kinship: Kinship
  /** A aus Sicht von B */
  reverse: Kinship
  /** Alle Personen auf dem Weg, von A nach B */
  path: string[]
  /** Nächste gemeinsame Vorfahren (Paar oder Einzelperson); leer, wenn einer vom anderen abstammt oder bei Heirat */
  common: string[]
  /** Ohne gängige Bezeichnung: Zahl der Personen zwischen A und B */
  detour: number | null
}

const MAX_NAMED_UR = 3 // bis „Urururgroßvater“, danach Generationen zählen

function pick(gender: Gender, male: string, female: string) {
  return gender === 'FEMALE' ? female : male
}

function kin(term: string, gender: Gender, byMarriage = false, via: KinWord[] = []): Kinship {
  return { term, gender, byMarriage, via }
}

/** Abstand jeder Person zu ihren Vorfahren, inklusive sich selbst (0) */
function withSelf(ix: TreeIndex, id: string) {
  const m = ancestorsOf(ix, id)
  m.set(id, 0)
  return m
}

/** Nächste gemeinsame Vorfahren: Schritte von A und von B nach oben, und wer es ist */
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

/** withUr(2, 'Großonkel') → „Ururgroßonkel“ */
function withUr(n: number, word: string) {
  return n === 0 ? word : urPrefix(n) + word.charAt(0).toLowerCase() + word.slice(1)
}

/** Blutsverwandtschaft: Begriff für B aus Sicht von A, oder null */
function bloodTerm(ix: TreeIndex, a: string, b: string, common = closestCommon(ix, a, b)): string | null {
  const person = ix.byId.get(b)
  if (!person || !common) return null
  const g = person.gender
  const { up, down } = common

  if (up === 0 && down === 0) return null

  // B ist Vorfahr von A
  if (down === 0) {
    if (up === 1) return pick(g, 'Vater', 'Mutter')
    if (up === 2) return pick(g, 'Großvater', 'Großmutter')
    if (up - 2 <= MAX_NAMED_UR) return urPrefix(up - 2) + pick(g, 'großvater', 'großmutter')
    return `${pick(g, 'Vorfahr', 'Vorfahrin')}, ${up} Generationen zurück`
  }

  // B ist Nachkomme von A
  if (up === 0) {
    if (down === 1) return pick(g, 'Sohn', 'Tochter')
    if (down === 2) return pick(g, 'Enkel', 'Enkelin')
    if (down - 2 <= MAX_NAMED_UR) return urPrefix(down - 2) + pick(g, 'enkel', 'enkelin')
    return `${pick(g, 'Nachfahre', 'Nachfahrin')}, ${down} Generationen später`
  }

  if (up === 1 && down === 1) {
    return isHalfSibling(ix, a, b) ? pick(g, 'Halbbruder', 'Halbschwester') : pick(g, 'Bruder', 'Schwester')
  }

  // Nichte/Neffe und weiter nach unten
  if (up === 1) {
    if (down === 2) return pick(g, 'Neffe', 'Nichte')
    if (down - 3 <= MAX_NAMED_UR) return withUr(down - 3, pick(g, 'Großneffe', 'Großnichte'))
    return `${pick(g, 'Nachfahre', 'Nachfahrin')} eines Geschwisters`
  }

  // Onkel/Tante und weiter nach oben
  if (down === 1) {
    if (up === 2) return pick(g, 'Onkel', 'Tante')
    if (up - 3 <= MAX_NAMED_UR) return withUr(up - 3, pick(g, 'Großonkel', 'Großtante'))
    return `${pick(g, 'Onkel', 'Tante')}, ${up - 1} Generationen zurück`
  }

  // Cousin/Cousine n. Grades, ggf. um Generationen versetzt
  const degree = Math.min(up, down) - 1
  const removed = Math.abs(up - down)
  const base = pick(g, 'Cousin', 'Cousine')
  const named = degree === 1 ? base : `${base} ${degree}. Grades`
  if (removed === 0) return named
  return `${named}, ${removed === 1 ? 'eine Generation' : `${removed} Generationen`} versetzt`
}

/** Von einer Person über ihre Eltern hinauf bis zu einem Vorfahren: [from, …, to] */
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

/** Weg A → gemeinsamer Vorfahr → B; bevorzugt einen Vorfahren, dessen Ehepartner auch gemeinsam ist */
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

/** Benannte Verwandtschaft von B aus Sicht von A, samt Weg durch den Baum */
function relate(ix: TreeIndex, a: string, b: string): Found | null {
  if (a === b) return null
  const other = ix.byId.get(b)
  if (!other || !ix.byId.has(a)) return null
  const g = other.gender

  if (spouseOf(ix, a) === b) return { kinship: kin(pick(g, 'Ehemann', 'Ehefrau'), g, true), path: [a, b], common: [] }

  const blood = closestCommon(ix, a, b)
  const term = blood && bloodTerm(ix, a, b, blood)
  if (blood && term) return { kinship: kin(term, g), ...bloodPath(ix, a, b, blood) }

  // B ist mit einem Blutsverwandten von A verheiratet
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

  // B ist mit dem Ehepartner von A blutsverwandt
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
 * Beschreibt Person `otherId` aus Sicht von `meId`.
 * Liefert null, wenn es dieselbe Person ist oder es keine gängige Bezeichnung gibt.
 */
export function describeKinship(ix: TreeIndex, meId: string, otherId: string): Kinship | null {
  return relate(ix, meId, otherId)?.kinship ?? null
}

/** Kürzester Weg über Eltern, Kinder und Ehepartner, oder null ohne Verbindung */
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

/** Einen Weg Schritt für Schritt benennen: „Ehemann der Schwester des Ehemanns“ */
function chainKinship(ix: TreeIndex, path: string[]): Kinship {
  const words: KinWord[] = []
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const cur = path[i]
    const next = path[i + 1]
    const g = ix.byId.get(cur)!.gender
    const isParent = parentsOf(ix, prev).includes(cur)
    // Hinauf zum Elternteil und gleich zu dessen Kind: Geschwister
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
 * Wie hängen A und B zusammen? Mit Bezeichnung in beide Richtungen und dem Weg
 * durch den Baum. Ohne gängige Bezeichnung wird der kürzeste Weg Schritt für
 * Schritt beschrieben. null, wenn es keine Verbindung gibt.
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

/** „Onkel“ ↔ „Tante“ usw., wenn der angeheiratete Partner das andere Geschlecht hat */
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

// ── In Worte fassen ──────────────────────────────────────────────────────────

const article = (g: Gender) => pick(g, 'der', 'die')
const ofArticle = (g: Gender) => pick(g, 'des', 'der')
const your = (g: Gender) => pick(g, 'dein', 'deine')
const ofYour = (g: Gender) => pick(g, 'deines', 'deiner')

const IRREGULAR_GENITIVE: Record<string, string> = { Mann: 'Mannes', Sohn: 'Sohnes' }

/** „des Cousins 2. Grades“, „des Neffen“, „der Cousine“ – nur das Wort, ohne Artikel */
function genitive({ term, gender }: KinWord): string {
  if (gender === 'FEMALE') return term
  const [first, ...rest] = term.split(' ')
  const gen = IRREGULAR_GENITIVE[first] ?? (/e$/.test(first) ? `${first}n` : /[sßx]$/.test(first) ? first : `${first}s`)
  return [gen, ...rest].join(' ')
}

/** „Cousin 2. Grades, eine Generation versetzt“ → Hauptwort und Zusatz */
function splitTerm(term: string): [string, string] {
  const i = term.indexOf(', ')
  return i < 0 ? [term, ''] : [term.slice(0, i), term.slice(i + 2)]
}

/** „der Schwester des Ehemanns“ – bei `yours` gehört die letzte Person zu „dir“ */
function viaChain(via: KinWord[], yours: boolean): string {
  return via
    .map((v, i) => `${yours && i === via.length - 1 ? ofYour(v.gender) : ofArticle(v.gender)} ${genitive(v)}`)
    .join(' ')
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Aus deiner Sicht, z. B. im Infoblatt: „Dein Urgroßvater“, „Ehemann deiner Cousine“ */
export function kinshipLabel(k: Kinship): string {
  const [head, tail] = splitTerm(k.term)
  const core = k.via.length ? `${head} ${viaChain(k.via, true)}` : `${capitalize(your(k.gender))} ${head}`
  return tail ? `${core}, ${tail}` : core
}

/** Ohne Bezug auf jemanden, als Überschrift: „Cousin 2. Grades“ + „eine Generation versetzt“ */
export function kinshipTitle(k: Kinship): { title: string; note: string } {
  const [head, tail] = splitTerm(k.term)
  return { title: k.via.length ? `${head} ${viaChain(k.via, false)}` : head, note: tail }
}

/** Eine Person mit Namen oder „du“ */
export type Party = { name: string } | 'you'

/**
 * Ganzer Satz, Subjekt ist B, Objekt ist A:
 * „Ida ist die Tante von Kurt.“, „Ida ist deine Tante.“, „Du bist die Tante von Kurt.“
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
