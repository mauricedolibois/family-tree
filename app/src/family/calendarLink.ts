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
// lang (optional): language of the event texts; missing means German.
// The parameter names are German on purpose: existing subscriptions use them.

import { buildIndex, lineageView, subTree, type LineScope, type Tree } from './model'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'

export type CalendarSelection = { personId: string; scope: LineScope }

const SIDE_WORDS = ['keine', 'geschwister', 'cousins', 'alle'] as const

const MAX_GENERATIONS = 99

/** Query string for the link, with leading "?"; empty for the whole family in German */
export function calendarQuery(sel: CalendarSelection | null, locale: Locale = DEFAULT_LOCALE): string {
  const q = new URLSearchParams()
  if (sel) {
    const gen = (n: number | null) => (n === null ? 'alle' : String(n))
    q.set('linie', sel.personId)
    q.set('vorfahren', gen(sel.scope.up))
    q.set('nachkommen', gen(sel.scope.down))
    q.set('seiten', SIDE_WORDS[sel.scope.side])
  }
  if (locale !== DEFAULT_LOCALE) q.set('lang', locale)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Language of the subscription; links without `lang` stay German */
export function calendarLocale(query: Query): Locale {
  const lang = first(query.lang)
  return isLocale(lang) ? lang : DEFAULT_LOCALE
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
