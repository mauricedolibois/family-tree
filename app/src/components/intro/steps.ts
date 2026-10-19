// src/components/intro/steps.ts
//
// Steps of the guided tour. Each step points at something in the app and explains
// it. Where there is something to do, the tour moves on by itself once it is done,
// or the step can be skipped.

import type { RelationPick } from '@/components/app/ViewProvider'
import type { Messages } from '@/i18n/messages'

type TourText = Messages['tour']

export type StepMode =
  /** Card in the middle, tree blocked */
  | 'modal'
  /** one area glows and is interactive, the rest is blocked */
  | 'spot'
  /** nothing blocked, free to look around */
  | 'free'

export type Step = {
  id: string
  mode: StepMode
  title: string
  text: string
  /** Area that is highlighted and interactive */
  target?: string
  /** Extra areas that belong to it (e.g. a results list that pops open) */
  also?: string[]
  /** Small gold ring around what matters */
  ring?: string
  /** Scroll the area or ring in the info sheet into view */
  scrollTo?: string
  /** Run on entering the step */
  enter?: () => void
  /** Is the task done? Then continue with `doneTo` */
  doneWhen?: () => boolean
  doneTo?: string
  /** Offer the birthday calendar (for this person's line, otherwise the whole family) */
  calendar?: { personId: string | null }
  /** "Next" button (for plain explanations) */
  nextLabel?: string
  /** On skip: clean up (e.g. close a form) and where to go */
  onSkip?: () => void
  skipTo?: string
}

export type TourActions = {
  focusOn: (id: string) => void
  select: (id: string | null) => void
  showLine: (id: string | null) => void
  showRelation: (pick: RelationPick | null) => void
}

const exists = (sel: string) => () => !!document.querySelector(sel)
const gone = (sel: string) => () => !document.querySelector(sel)
const click = (sel: string) => () => (document.querySelector(sel) as HTMLElement | null)?.click()

/** Tour based on the visitor's own entry */
export function personalSteps(me: string, given: string, a: TourActions, t: TourText): Step[] {
  const s = t.steps
  return [
    {
      id: 'card',
      mode: 'spot',
      target: `[data-person="${me}"]`,
      enter: () => {
        a.showLine(null)
        a.focusOn(me)
      },
      title: s.card.title(given),
      text: s.card.text,
      nextLabel: t.next,
    },
    {
      id: 'edit',
      mode: 'spot',
      target: '[data-tour="edit"]',
      scrollTo: '[data-tour="edit"]',
      title: s.edit.title,
      text: s.edit.text,
      doneWhen: exists('[data-tour="edit-form"]'),
      doneTo: 'form',
      skipTo: 'child',
    },
    {
      id: 'form',
      mode: 'spot',
      target: '[data-tour="sheet"]',
      ring: '[data-tour="add-photo"]',
      scrollTo: '[data-tour="add-photo"]',
      title: s.form.title,
      text: s.form.text,
      doneWhen: gone('[data-tour="edit-form"]'),
      doneTo: 'child',
      onSkip: click('[data-tour="form-cancel"]'),
      skipTo: 'child',
    },
    {
      id: 'child',
      mode: 'spot',
      target: '[data-tour="add-child"]',
      scrollTo: '[data-tour="add-child"]',
      title: s.child.title,
      text: s.child.text,
      doneWhen: exists('[data-tour="relative-form"]'),
      doneTo: 'child-form',
      skipTo: 'line',
    },
    {
      id: 'child-form',
      mode: 'spot',
      target: '[data-tour="sheet"]',
      title: s.childForm.title,
      text: s.childForm.text,
      doneWhen: gone('[data-tour="relative-form"]'),
      doneTo: 'line',
      onSkip: click('[data-tour="form-cancel"]'),
      skipTo: 'line',
    },
    {
      id: 'line',
      mode: 'free',
      enter: () => {
        a.select(null)
        a.showLine(me)
      },
      title: s.line.title,
      text: s.line.text,
      nextLabel: t.next,
    },
    {
      id: 'scope',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      ring: '[data-tour="scope"]',
      title: s.scope.title,
      text: s.scope.text,
      nextLabel: t.next,
    },
    {
      id: 'relation',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      also: ['[data-tour="overlay"] [role="listbox"]'],
      ring: '[data-tour="relation-to"]',
      enter: () => a.showRelation({ from: me, to: null }),
      title: s.relation.title,
      text: s.relation.text,
      doneWhen: exists('[data-tour="relation-result"]'),
      doneTo: 'relation-result',
      skipTo: 'menu',
    },
    {
      id: 'relation-result',
      mode: 'free',
      title: s.relationResult.title,
      text: s.relationResult.text,
      nextLabel: t.next,
    },
    menuStep(a, t),
    calendarStep(me, t),
    {
      id: 'done',
      mode: 'modal',
      title: s.done.title,
      text: s.done.text,
      nextLabel: t.start,
    },
  ]
}

/** Tour for visitors who are not in the tree (yet) */
export function guestSteps(a: TourActions, t: TourText): Step[] {
  const s = t.steps
  return [
    {
      id: 'views',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      enter: () => a.showLine(null),
      title: s.views.title,
      text: s.views.text,
      nextLabel: t.next,
    },
    {
      id: 'relation',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      also: ['[data-tour="overlay"] [role="listbox"]'],
      enter: () => a.showRelation({ from: null, to: null }),
      title: s.guestRelation.title,
      text: s.guestRelation.text,
      doneWhen: exists('[data-tour="relation-result"]'),
      doneTo: 'relation-result',
      skipTo: 'menu',
    },
    {
      id: 'relation-result',
      mode: 'free',
      title: s.guestRelationResult.title,
      text: s.guestRelationResult.text,
      nextLabel: t.next,
    },
    menuStep(a, t),
    calendarStep(null, t),
    {
      id: 'done',
      mode: 'modal',
      title: s.guestDone.title,
      text: s.guestDone.text,
      nextLabel: t.start,
    },
  ]
}

function menuStep(a: TourActions, t: TourText): Step {
  return {
    id: 'menu',
    mode: 'spot',
    target: '[data-tour="menu"]',
    enter: () => a.showLine(null),
    title: t.steps.menu.title,
    text: t.steps.menu.text,
    nextLabel: t.next,
  }
}

/** Finally: birthdays into your own calendar; line and scope are part of the link */
function calendarStep(me: string | null, t: TourText): Step {
  return {
    id: 'calendar',
    mode: 'modal',
    calendar: { personId: me },
    title: t.steps.calendar.title,
    text: me ? t.steps.calendar.textLine : t.steps.calendar.textFamily,
    nextLabel: t.next,
  }
}
