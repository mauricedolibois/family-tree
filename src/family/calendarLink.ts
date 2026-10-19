// src/family/calendarLink.ts
//
// Welche Geburtstage ein Kalender-Abo enthält – steht als Parameter im Link,
// damit jede und jeder sich die eigene Linie abonnieren kann:
//
//   …/geburtstage.ics                                    ganze Familie
//   …?linie=<id>&vorfahren=alle&nachkommen=2&seiten=cousins
//
// vorfahren/nachkommen: Anzahl Generationen oder „alle“ (Standard)
// seiten: keine (Standard) | geschwister | cousins | alle – wie bei „Meine Linie“
// sprache: en für englische Texte im Kalender (Standard deutsch)

import { buildIndex, lineageView, subTree, type LineScope, type Tree } from './model'
import type { Lang } from '@/i18n/lang'

export type CalendarSelection = { personId: string; scope: LineScope }

const SIDE_WORDS = ['keine', 'geschwister', 'cousins', 'alle'] as const

const MAX_GENERATIONS = 99

/** Parameter für den Link, mit führendem „?“ – leer für die ganze Familie auf Deutsch */
export function calendarQuery(sel: CalendarSelection | null, lang: Lang = 'de'): string {
  const gen = (n: number | null) => (n === null ? 'alle' : String(n))
  const q = new URLSearchParams(
    sel
      ? {
          linie: sel.personId,
          vorfahren: gen(sel.scope.up),
          nachkommen: gen(sel.scope.down),
          seiten: SIDE_WORDS[sel.scope.side],
        }
      : {},
  )
  if (lang === 'en') q.set('sprache', 'en')
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Sprache der Kalendertexte aus dem Link */
export function calendarLang(query: Query): Lang {
  return first(query.sprache) === 'en' ? 'en' : 'de'
}

type Query = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase()

function generations(v: string | string[] | undefined): number | null {
  const s = first(v)
  if (!s || !/^\d{1,2}$/.test(s)) return null // fehlt, „alle“ oder Unsinn: alle
  return Math.min(Number(s), MAX_GENERATIONS)
}

function side(v: string | string[] | undefined): LineScope['side'] {
  const s = first(v)
  if (!s) return 0
  const word = SIDE_WORDS.indexOf(s as (typeof SIDE_WORDS)[number])
  if (word >= 0) return word as LineScope['side']
  return /^[0-3]$/.test(s) ? (Number(s) as LineScope['side']) : 0
}

/** Aus den Parametern des Links; null heißt ganze Familie */
export function parseCalendarQuery(query: Query): CalendarSelection | null {
  const personId = (Array.isArray(query.linie) ? query.linie[0] : query.linie)?.trim()
  if (!personId) return null
  return {
    personId,
    scope: { up: generations(query.vorfahren), down: generations(query.nachkommen), side: side(query.seiten) },
  }
}

/**
 * Die Personen des Abos. Gibt es die Person nicht (mehr), bleibt der Kalender leer –
 * lieber keine Termine als plötzlich die ganze Familie.
 */
export function calendarSubset(tree: Tree, sel: CalendarSelection | null): { tree: Tree; personName: string | null } {
  if (!sel) return { tree, personName: null }
  const index = buildIndex(tree)
  const person = index.byId.get(sel.personId)
  if (!person) return { tree: { ...tree, members: {} }, personName: null }
  return { tree: subTree(tree, lineageView(index, sel.personId, sel.scope)), personName: person.name }
}
