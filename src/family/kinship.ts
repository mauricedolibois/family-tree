// src/family/kinship.ts
//
// „Wie sind wir verwandt?“ – beschreibt eine Person aus Sicht einer anderen
// mit den üblichen Verwandtschaftsbezeichnungen (deutsch oder englisch) und
// findet den Weg zwischen beiden durch den Baum.

import { ancestorsOf, childrenOf, isHalfSibling, parentsOf, spouseOf, type Gender, type TreeIndex } from './model'
import type { Lang } from '@/i18n/lang'

/**
 * Art der Verwandtschaft, unabhängig von der Sprache. Die Wörter dazu
 * („Urgroßvater“, „great-grandfather“) entstehen erst beim Anzeigen.
 */
export type Rel =
  | { kind: 'parent'; up: number }
  | { kind: 'child'; down: number }
  | { kind: 'sibling'; half: boolean }
  /** Neffe/Nichte (down 2), Großneffe (3) … */
  | { kind: 'nibling'; down: number }
  /** Onkel/Tante (up 2), Großonkel (3) …; angeheiratet mit `inLaw` */
  | { kind: 'pibling'; up: number; inLaw?: boolean }
  | { kind: 'cousin'; degree: number; removed: number }
  | { kind: 'spouse' }
  /** „Mann“/„Frau“ in Ketten wie „Bruder deines Mannes“ */
  | { kind: 'partner' }
  | { kind: 'childInLaw' }
  | { kind: 'parentInLaw' }
  | { kind: 'siblingInLaw' }
  | { kind: 'stepParent' }
  | { kind: 'stepChild' }

/** Ein Verwandtschaftsverhältnis und das Geschlecht der Person, die es bezeichnet */
export type KinWord = { rel: Rel; gender: Gender }

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

function kin(rel: Rel, gender: Gender, byMarriage = false, via: KinWord[] = []): Kinship {
  return { rel, gender, byMarriage, via }
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

/** Blutsverwandtschaft: B aus Sicht von A, oder null */
function bloodRel(ix: TreeIndex, a: string, b: string, common = closestCommon(ix, a, b)): Rel | null {
  if (!ix.byId.get(b) || !common) return null
  const { up, down } = common
  if (up === 0 && down === 0) return null
  if (down === 0) return { kind: 'parent', up }
  if (up === 0) return { kind: 'child', down }
  if (up === 1 && down === 1) return { kind: 'sibling', half: isHalfSibling(ix, a, b) }
  if (up === 1) return { kind: 'nibling', down }
  if (down === 1) return { kind: 'pibling', up }
  return { kind: 'cousin', degree: Math.min(up, down) - 1, removed: Math.abs(up - down) }
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

  if (spouseOf(ix, a) === b) return { kinship: kin({ kind: 'spouse' }, g, true), path: [a, b], common: [] }

  const blood = closestCommon(ix, a, b)
  const rel = blood && bloodRel(ix, a, b, blood)
  if (blood && rel) return { kinship: kin(rel, g), ...bloodPath(ix, a, b, blood) }

  // B ist mit einem Blutsverwandten von A verheiratet
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
    if (spouseRel?.kind === 'pibling') return found(kin({ kind: 'pibling', up: spouseRel.up, inLaw: true }, g, true))
    const sg = ix.byId.get(otherSpouse)!.gender
    if (spouseRel && !hasTail({ rel: spouseRel, gender: sg })) {
      return found(kin({ kind: 'spouse' }, g, true, [{ rel: spouseRel, gender: sg }]))
    }
  }

  // B ist mit dem Ehepartner von A blutsverwandt
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
      words.push({ rel: { kind: 'sibling', half: isHalfSibling(ix, prev, next) }, gender: ng })
      i++
    } else if (isParent) words.push({ rel: { kind: 'parent', up: 1 }, gender: g })
    else if (childrenOf(ix, prev).includes(cur)) words.push({ rel: { kind: 'child', down: 1 }, gender: g })
    else words.push({ rel: { kind: 'spouse' }, gender: g })
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

// ── In Worte fassen ──────────────────────────────────────────────────────────

function urPrefix(n: number) {
  return 'Ur'.repeat(n)
}

/** withUr(2, 'Großonkel') → „Ururgroßonkel“ */
function withUr(n: number, word: string) {
  return n === 0 ? word : urPrefix(n) + word.charAt(0).toLowerCase() + word.slice(1)
}

/** Deutsch: Hauptwort und Zusatz, z. B. [„Cousine 2. Grades“, „eine Generation versetzt“] */
function termDe(rel: Rel, g: Gender): [string, string] {
  switch (rel.kind) {
    case 'parent': {
      const { up } = rel
      if (up === 1) return [pick(g, 'Vater', 'Mutter'), '']
      if (up === 2) return [pick(g, 'Großvater', 'Großmutter'), '']
      if (up - 2 <= MAX_NAMED_UR) return [urPrefix(up - 2) + pick(g, 'großvater', 'großmutter'), '']
      return [pick(g, 'Vorfahr', 'Vorfahrin'), `${up} Generationen zurück`]
    }
    case 'child': {
      const { down } = rel
      if (down === 1) return [pick(g, 'Sohn', 'Tochter'), '']
      if (down === 2) return [pick(g, 'Enkel', 'Enkelin'), '']
      if (down - 2 <= MAX_NAMED_UR) return [urPrefix(down - 2) + pick(g, 'enkel', 'enkelin'), '']
      return [pick(g, 'Nachfahre', 'Nachfahrin'), `${down} Generationen später`]
    }
    case 'sibling':
      return [rel.half ? pick(g, 'Halbbruder', 'Halbschwester') : pick(g, 'Bruder', 'Schwester'), '']
    case 'nibling': {
      const { down } = rel
      if (down === 2) return [pick(g, 'Neffe', 'Nichte'), '']
      if (down - 3 <= MAX_NAMED_UR) return [withUr(down - 3, pick(g, 'Großneffe', 'Großnichte')), '']
      return [`${pick(g, 'Nachfahre', 'Nachfahrin')} eines Geschwisters`, '']
    }
    case 'pibling': {
      const { up } = rel
      const tag = rel.inLaw ? ' (angeheiratet)' : ''
      if (up === 2) return [pick(g, 'Onkel', 'Tante') + tag, '']
      if (up - 3 <= MAX_NAMED_UR) return [withUr(up - 3, pick(g, 'Großonkel', 'Großtante')) + tag, '']
      return [pick(g, 'Onkel', 'Tante'), `${up - 1} Generationen zurück${tag}`]
    }
    case 'cousin': {
      const base = pick(g, 'Cousin', 'Cousine')
      const named = rel.degree === 1 ? base : `${base} ${rel.degree}. Grades`
      if (rel.removed === 0) return [named, '']
      return [named, `${rel.removed === 1 ? 'eine Generation' : `${rel.removed} Generationen`} versetzt`]
    }
    case 'spouse':
      return [pick(g, 'Ehemann', 'Ehefrau'), '']
    case 'partner':
      return [pick(g, 'Mann', 'Frau'), '']
    case 'childInLaw':
      return [pick(g, 'Schwiegersohn', 'Schwiegertochter'), '']
    case 'parentInLaw':
      return [pick(g, 'Schwiegervater', 'Schwiegermutter'), '']
    case 'siblingInLaw':
      return [pick(g, 'Schwager', 'Schwägerin'), '']
    case 'stepParent':
      return [pick(g, 'Stiefvater', 'Stiefmutter'), '']
    case 'stepChild':
      return [pick(g, 'Stiefsohn', 'Stieftochter'), '']
  }
}

const greats = (n: number) => 'great-'.repeat(n)

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`

/** Englisch: „second cousin once removed“, „great-great-grandfather“, „ancestor“ + „9 generations back“ */
function termEn(rel: Rel, g: Gender): [string, string] {
  switch (rel.kind) {
    case 'parent': {
      const { up } = rel
      if (up === 1) return [pick(g, 'father', 'mother'), '']
      if (up - 2 <= MAX_NAMED_UR) return [greats(up - 2) + pick(g, 'grandfather', 'grandmother'), '']
      return ['ancestor', `${up} generations back`]
    }
    case 'child': {
      const { down } = rel
      if (down === 1) return [pick(g, 'son', 'daughter'), '']
      if (down - 2 <= MAX_NAMED_UR) return [greats(down - 2) + pick(g, 'grandson', 'granddaughter'), '']
      return ['descendant', `${down} generations later`]
    }
    case 'sibling':
      return [rel.half ? pick(g, 'half-brother', 'half-sister') : pick(g, 'brother', 'sister'), '']
    case 'nibling': {
      const { down } = rel
      if (down === 2) return [pick(g, 'nephew', 'niece'), '']
      if (down - 3 <= MAX_NAMED_UR) return [greats(down - 3) + pick(g, 'grandnephew', 'grandniece'), '']
      return ['descendant of a sibling', '']
    }
    case 'pibling': {
      const { up } = rel
      const word = pick(g, 'uncle', 'aunt')
      if (up - 3 <= MAX_NAMED_UR) return [greats(up - 2) + word + (rel.inLaw ? ' by marriage' : ''), '']
      return [word, `${up - 1} generations back${rel.inLaw ? ' (by marriage)' : ''}`]
    }
    case 'cousin': {
      if (rel.degree === 1 && rel.removed === 0) return ['cousin', '']
      const removed =
        rel.removed === 0
          ? ''
          : rel.removed === 1
          ? ' once removed'
          : rel.removed === 2
          ? ' twice removed'
          : ` ${rel.removed} times removed`
      return [`${ordinal(rel.degree)} cousin${removed}`, '']
    }
    case 'spouse':
    case 'partner':
      return [pick(g, 'husband', 'wife'), '']
    case 'childInLaw':
      return [pick(g, 'son-in-law', 'daughter-in-law'), '']
    case 'parentInLaw':
      return [pick(g, 'father-in-law', 'mother-in-law'), '']
    case 'siblingInLaw':
      return [pick(g, 'brother-in-law', 'sister-in-law'), '']
    case 'stepParent':
      return [pick(g, 'stepfather', 'stepmother'), '']
    case 'stepChild':
      return [pick(g, 'stepson', 'stepdaughter'), '']
  }
}

function termParts(word: KinWord, lang: Lang): [string, string] {
  return lang === 'en' ? termEn(word.rel, word.gender) : termDe(word.rel, word.gender)
}

/** Hat die Bezeichnung einen Zusatz wie „, 5 Generationen zurück“? Dann taugt sie nicht für Ketten. */
function hasTail(word: KinWord): boolean {
  return termDe(word.rel, word.gender)[1] !== ''
}

/** Ganze Bezeichnung, z. B. „Cousine 2. Grades, eine Generation versetzt“ oder „first cousin once removed“ */
export function kinTerm(word: KinWord, lang: Lang = 'de'): string {
  const [head, tail] = termParts(word, lang)
  return tail ? `${head}, ${tail}` : head
}

const article = (g: Gender) => pick(g, 'der', 'die')
const ofArticle = (g: Gender) => pick(g, 'des', 'der')
const your = (g: Gender) => pick(g, 'dein', 'deine')
const ofYour = (g: Gender) => pick(g, 'deines', 'deiner')

const IRREGULAR_GENITIVE: Record<string, string> = { Mann: 'Mannes', Sohn: 'Sohnes' }

/** „des Cousins 2. Grades“, „des Neffen“, „der Cousine“ – nur das Wort, ohne Artikel */
function genitive(word: KinWord): string {
  const [term] = termDe(word.rel, word.gender)
  if (word.gender === 'FEMALE') return term
  const [first, ...rest] = term.split(' ')
  const gen = IRREGULAR_GENITIVE[first] ?? (/e$/.test(first) ? `${first}n` : /[sßx]$/.test(first) ? first : `${first}s`)
  return [gen, ...rest].join(' ')
}

/** „der Schwester des Ehemanns“ – bei `yours` gehört die letzte Person zu „dir“ */
function viaChain(via: KinWord[], yours: boolean): string {
  return via
    .map((v, i) => `${yours && i === via.length - 1 ? ofYour(v.gender) : ofArticle(v.gender)} ${genitive(v)}`)
    .join(' ')
}

/** Englisch, von der anderen Seite her: „husband’s sister’s “ (via steht von B aus gelesen) */
function possessiveChain(via: KinWord[]): string {
  return via
    .slice()
    .reverse()
    .map((v) => `${termEn(v.rel, v.gender)[0]}’s `)
    .join('')
}

const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Aus deiner Sicht, z. B. im Infoblatt: „Dein Urgroßvater“, „Ehemann deiner Cousine“, „Your cousin’s husband“ */
export function kinshipLabel(k: Kinship, lang: Lang = 'de'): string {
  const [head, tail] = termParts(k, lang)
  const core =
    lang === 'en'
      ? `Your ${possessiveChain(k.via)}${head}`
      : k.via.length
      ? `${head} ${viaChain(k.via, true)}`
      : `${capitalize(your(k.gender))} ${head}`
  return tail ? `${core}, ${tail}` : core
}

/** Ohne Bezug auf jemanden, als Überschrift: „Cousin 2. Grades“ + „eine Generation versetzt“ */
export function kinshipTitle(k: Kinship, lang: Lang = 'de'): { title: string; note: string } {
  const [head, tail] = termParts(k, lang)
  if (lang === 'en') return { title: capitalize(`${possessiveChain(k.via)}${head}`), note: tail }
  return { title: k.via.length ? `${head} ${viaChain(k.via, false)}` : head, note: tail }
}

/** Eine Person mit Namen oder „du“ */
export type Party = { name: string } | 'you'

/**
 * Ganzer Satz, Subjekt ist B, Objekt ist A:
 * „Ida ist die Tante von Kurt.“, „Ida ist deine Tante.“, „Du bist die Tante von Kurt.“
 * Englisch: „Ida is Kurt’s aunt.“, „Ida is your aunt.“, „You are Kurt’s aunt.“
 */
export function kinshipSentence(k: Kinship, subject: Party, object: Party, lang: Lang = 'de'): string {
  const [head, tail] = termParts(k, lang)
  if (lang === 'en') {
    const start = subject === 'you' ? 'You are' : `${subject.name} is`
    const owner = object === 'you' ? 'your' : possessive(object.name)
    return `${start} ${owner} ${possessiveChain(k.via)}${head}${tail ? `, ${tail}` : ''}.`
  }
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
