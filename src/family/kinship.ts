// src/family/kinship.ts
//
// „Wie sind wir verwandt?“ – beschreibt eine Person aus Sicht einer anderen
// mit den üblichen deutschen Verwandtschaftsbezeichnungen.

import { ancestorsOf, isHalfSibling, spouseOf, type Gender, type TreeIndex } from './model'

export type Kinship = {
  /** z. B. „Urgroßvater“, „Cousine 2. Grades“ */
  term: string
  /** „Dein“ oder „Deine“, passend zum Wort */
  possessive: 'Dein' | 'Deine'
  /** über Heirat statt Abstammung */
  byMarriage: boolean
}

const MAX_NAMED_UR = 3 // bis „Urururgroßvater“, danach Generationen zählen

function pick(gender: Gender, male: string, female: string) {
  return gender === 'FEMALE' ? female : male
}

function result(term: string, gender: Gender, byMarriage = false): Kinship {
  return { term, possessive: gender === 'FEMALE' ? 'Deine' : 'Dein', byMarriage }
}

/** Abstand jeder Person zu ihren Vorfahren, inklusive sich selbst (0) */
function withSelf(ix: TreeIndex, id: string) {
  const m = ancestorsOf(ix, id)
  m.set(id, 0)
  return m
}

/** Nächster gemeinsamer Vorfahr: Schritte von A und von B nach oben */
function closestCommon(ix: TreeIndex, a: string, b: string): { up: number; down: number } | null {
  const ancA = withSelf(ix, a)
  const ancB = withSelf(ix, b)
  let best: { up: number; down: number } | null = null
  for (const [id, da] of ancA) {
    const db = ancB.get(id)
    if (db === undefined) continue
    if (
      !best ||
      da + db < best.up + best.down ||
      (da + db === best.up + best.down && Math.max(da, db) < Math.max(best.up, best.down))
    ) {
      best = { up: da, down: db }
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
function bloodTerm(ix: TreeIndex, a: string, b: string): string | null {
  const person = ix.byId.get(b)
  if (!person) return null
  const g = person.gender
  const common = closestCommon(ix, a, b)
  if (!common) return null
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

/**
 * Beschreibt Person `otherId` aus Sicht von `meId`.
 * Liefert null, wenn es dieselbe Person ist oder keine Verbindung gefunden wird.
 */
export function describeKinship(ix: TreeIndex, meId: string, otherId: string): Kinship | null {
  if (meId === otherId) return null
  const other = ix.byId.get(otherId)
  const me = ix.byId.get(meId)
  if (!other || !me) return null
  const g = other.gender

  if (spouseOf(ix, meId) === otherId) return result(pick(g, 'Ehemann', 'Ehefrau'), g, true)

  const blood = bloodTerm(ix, meId, otherId)
  if (blood) return result(blood, g)

  // B ist mit einem Blutsverwandten von A verheiratet
  const otherSpouse = spouseOf(ix, otherId)
  if (otherSpouse) {
    const rel = closestCommon(ix, meId, otherSpouse)
    if (rel) {
      const { up, down } = rel
      if (up === 0 && down === 1) return result(pick(g, 'Schwiegersohn', 'Schwiegertochter'), g, true)
      if (up === 1 && down === 0) return result(pick(g, 'Stiefvater', 'Stiefmutter'), g, true)
      if (up === 1 && down === 1) return result(pick(g, 'Schwager', 'Schwägerin'), g, true)
      if (down === 1 && up >= 2) {
        const t = bloodTerm(ix, meId, otherSpouse)
        if (t) return result(`${swapGender(t, g)} (angeheiratet)`, g, true)
      }
      const spouseTerm = bloodTerm(ix, meId, otherSpouse)
      if (spouseTerm && !spouseTerm.includes(',')) {
        return result(
          `${pick(g, 'Ehemann', 'Ehefrau')} ${ofRelative(spouseTerm, ix.byId.get(otherSpouse)!.gender)}`,
          g,
          true,
        )
      }
    }
  }

  // B ist mit dem Ehepartner von A blutsverwandt
  const mySpouse = spouseOf(ix, meId)
  if (mySpouse) {
    const rel = closestCommon(ix, mySpouse, otherId)
    if (rel) {
      const { up, down } = rel
      if (down === 0 && up === 1) return result(pick(g, 'Schwiegervater', 'Schwiegermutter'), g, true)
      if (up === 1 && down === 1) return result(pick(g, 'Schwager', 'Schwägerin'), g, true)
      if (up === 0 && down === 1) return result(pick(g, 'Stiefsohn', 'Stieftochter'), g, true)
      const t = bloodTerm(ix, mySpouse, otherId)
      const sp = ix.byId.get(mySpouse)!
      if (t) return result(`${t} ${sp.gender === 'FEMALE' ? 'deiner Frau' : 'deines Mannes'}`, g, true)
    }
  }

  return null
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

/** „deines Cousins“, „deiner Cousine“, „deines Neffen“ */
function ofRelative(term: string, g: Gender): string {
  if (g === 'FEMALE') return `deiner ${term}`
  const [first, ...rest] = term.split(' ')
  const gen = /e$/.test(first) ? `${first}n` : /[sßx]$/.test(first) ? first : `${first}s`
  return ['deines', gen, ...rest].join(' ')
}
