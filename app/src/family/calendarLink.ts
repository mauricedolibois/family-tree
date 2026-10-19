// src/family/calendarLink.ts
//
// Which birthdays a calendar subscription contains. The scope is part of the link,
// so everyone can subscribe to their own line:
//
//   …/geburtstage.ics                                    whole family
//   …?linie=<id>&vorfahren=alle&nachkommen=2&seiten=cousins
//
// vorfahren/nachkommen (ancestors/descendants): number of generations or "alle" (default)
// seiten (collateral lines): keine (default) | geschwister | cousins | alle, as in "Meine Linie"
// The parameter names are German on purpose: existing subscriptions use them.

import { buildIndex, lineageView, subTree, type LineScope, type Tree } from './model'

export type CalendarSelection = { personId: string; scope: LineScope }

const SIDE_WORDS = ['keine', 'geschwister', 'cousins', 'alle'] as const

const MAX_GENERATIONS = 99

/** Query string for the link, with leading "?"; empty for the whole family */
export function calendarQuery(sel: CalendarSelection | null): string {
  if (!sel) return ''
  const gen = (n: number | null) => (n === null ? 'alle' : String(n))
  const q = new URLSearchParams({
    linie: sel.personId,
    vorfahren: gen(sel.scope.up),
    nachkommen: gen(sel.scope.down),
    seiten: SIDE_WORDS[sel.scope.side],
  })
  return `?${q.toString()}`
}

type Query = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase()

function generations(v: string | string[] | undefined): number | null {
  const s = first(v)
  if (!s || !/^\d{1,2}$/.test(s)) return null // missing, "alle" or garbage: all
  return Math.min(Number(s), MAX_GENERATIONS)
}

function side(v: string | string[] | undefined): LineScope['side'] {
  const s = first(v)
  if (!s) return 0
  const word = SIDE_WORDS.indexOf(s as (typeof SIDE_WORDS)[number])
  if (word >= 0) return word as LineScope['side']
  return /^[0-3]$/.test(s) ? (Number(s) as LineScope['side']) : 0
}

/** Parsed from the link parameters; null means the whole family */
export function parseCalendarQuery(query: Query): CalendarSelection | null {
  const personId = (Array.isArray(query.linie) ? query.linie[0] : query.linie)?.trim()
  if (!personId) return null
  return {
    personId,
    scope: { up: generations(query.vorfahren), down: generations(query.nachkommen), side: side(query.seiten) },
  }
}

/**
 * People in the subscription. If the person no longer exists the calendar stays
 * empty; better no events than suddenly the whole family.
 */
export function calendarSubset(tree: Tree, sel: CalendarSelection | null): { tree: Tree; personName: string | null } {
  if (!sel) return { tree, personName: null }
  const index = buildIndex(tree)
  const person = index.byId.get(sel.personId)
  if (!person) return { tree: { ...tree, members: {} }, personName: null }
  return { tree: subTree(tree, lineageView(index, sel.personId, sel.scope)), personName: person.name }
}
