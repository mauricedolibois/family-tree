// src/components/intro/steps.ts
//
// Die Schritte der Einführung. Jeder Schritt zeigt auf etwas in der App und
// erklärt es. Wo man etwas tun kann, geht es von selbst weiter, sobald es
// getan ist – oder man überspringt den Schritt.

import type { RelationPick } from '@/components/app/ViewProvider'

export type StepMode =
  /** Karte in der Mitte, Baum gesperrt */
  | 'modal'
  /** ein Bereich leuchtet und ist bedienbar, der Rest ist gesperrt */
  | 'spot'
  /** nichts gesperrt, man darf sich frei umsehen */
  | 'free'

export type Step = {
  id: string
  mode: StepMode
  title: string
  text: string
  /** Bereich, der hervorgehoben und bedienbar ist */
  target?: string
  /** Zusätzliche Bereiche, die mit dazugehören (z. B. eine aufklappende Trefferliste) */
  also?: string[]
  /** Kleiner Goldring um das, worauf es ankommt */
  ring?: string
  /** Bereich bzw. Ring im Infoblatt in Sicht scrollen */
  scrollTo?: string
  /** Beim Betreten ausführen */
  enter?: () => void
  /** Ist die Aufgabe erledigt? Dann geht es zu `doneTo` */
  doneWhen?: () => boolean
  doneTo?: string
  /** Knopf „Weiter“ (für reine Erklärungen) */
  nextLabel?: string
  /** Beim Überspringen: aufräumen (z. B. Formular schließen) und wohin */
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

/** Rundgang anhand der eigenen Person */
export function personalSteps(me: string, given: string, a: TourActions): Step[] {
  return [
    {
      id: 'card',
      mode: 'spot',
      target: `[data-person="${me}"]`,
      enter: () => {
        a.showLine(null)
        a.focusOn(me)
      },
      title: `Das bist du, ${given}`,
      text: 'Jede Karte ist ein Eintrag in der Chronik. Ein Tippen schlägt das Blatt mit allen Angaben auf – deins liegt schon offen.',
      nextLabel: 'Weiter',
    },
    {
      id: 'edit',
      mode: 'spot',
      target: '[data-tour="edit"]',
      scrollTo: '[data-tour="edit"]',
      title: 'Schreib in die Chronik',
      text: 'Fehlt etwas oder stimmt etwas nicht? Tippe auf „Bearbeiten“ und ergänze, was du weißt.',
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
      title: 'Dein Bildnis',
      text: 'Unter „Fotos und Dokumente“ fügst du ein Bild von dir hinzu – es erscheint dann im Medaillon deiner Karte. Trag gern auch Geburtsort oder Beruf ein. Zum Schluss „Speichern“.',
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
      title: 'Die Chronik wächst',
      text: 'Fehlt ein Kind von dir? Hier trägst du es ein – genauso Ehepartner oder Eltern.',
      doneWhen: exists('[data-tour="relative-form"]'),
      doneTo: 'child-form',
      skipTo: 'line',
    },
    {
      id: 'child-form',
      mode: 'spot',
      target: '[data-tour="sheet"]',
      title: 'Ein neuer Name',
      text: 'Name eintragen, Mann oder Frau wählen und „Hinzufügen“ – schon steht es in der Chronik.',
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
      title: 'Das ist deine Linie',
      text: 'Deine Eltern, Großeltern und alle, die vor ihnen kamen. Schieb und zoom ruhig ein wenig herum.',
      nextLabel: 'Weiter',
    },
    {
      id: 'scope',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      ring: '[data-tour="scope"]',
      title: 'Wie weit soll sie reichen?',
      text: 'Mit dem Regler zeigst du mehr oder weniger Generationen – auf Wunsch auch Geschwister und Cousins.',
      nextLabel: 'Weiter',
    },
    {
      id: 'relation',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      also: ['[data-tour="overlay"] [role="listbox"]'],
      ring: '[data-tour="relation-to"]',
      enter: () => a.showRelation({ from: me, to: null }),
      title: 'Wie sind wir verwandt?',
      text: 'Gib hier eine Person ein, zu der du deine Beziehung wissen willst.',
      doneWhen: exists('[data-tour="relation-result"]'),
      doneTo: 'relation-result',
      skipTo: 'menu',
    },
    {
      id: 'relation-result',
      mode: 'free',
      title: 'Der Faden zwischen euch',
      text: 'Oben steht, wie ihr verwandt seid. Der Baum zeigt nur noch den Weg von dir zu dieser Person.',
      nextLabel: 'Weiter',
    },
    menuStep(a),
    {
      id: 'done',
      mode: 'modal',
      title: 'Die Chronik gehört jetzt auch dir',
      text: 'Nur Mut: Vor jeder Änderung wird der alte Stand verwahrt. Es geht nichts verloren.',
      nextLabel: 'Los geht’s',
    },
  ]
}

/** Rundgang für alle, die (noch) nicht im Baum stehen */
export function guestSteps(a: TourActions): Step[] {
  return [
    {
      id: 'views',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      enter: () => a.showLine(null),
      title: 'Drei Ansichten',
      text: '„Ganze Familie“ zeigt alle, „Meine Linie“ deine Vorfahren und Nachkommen und „Beziehung“ den Weg zwischen zwei Menschen.',
      nextLabel: 'Weiter',
    },
    {
      id: 'relation',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      also: ['[data-tour="overlay"] [role="listbox"]'],
      enter: () => a.showRelation({ from: null, to: null }),
      title: 'Wie sind sie verwandt?',
      text: 'Wähle zwei Personen – die Chronik verrät, wie sie zusammengehören.',
      doneWhen: exists('[data-tour="relation-result"]'),
      doneTo: 'relation-result',
      skipTo: 'menu',
    },
    {
      id: 'relation-result',
      mode: 'free',
      title: 'Der Faden zwischen ihnen',
      text: 'Oben steht, wie die beiden verwandt sind. Der Baum zeigt nur noch den Weg zwischen ihnen.',
      nextLabel: 'Weiter',
    },
    menuStep(a),
    {
      id: 'done',
      mode: 'modal',
      title: 'Willkommen in der Chronik',
      text: 'Du findest dich noch nicht? Bitte jemanden aus der Familie, dich einzutragen – oder trag dich selbst als Kind deiner Eltern ein. Vor jeder Änderung wird der alte Stand verwahrt.',
      nextLabel: 'Los geht’s',
    },
  ]
}

function menuStep(a: TourActions): Step {
  return {
    id: 'menu',
    mode: 'spot',
    target: '[data-tour="menu"]',
    enter: () => a.showLine(null),
    title: 'Suche und Menü',
    text: 'Oben findest du jede Person über die Suche. Im Menü druckst du Linien als PDF – und kannst diese Einführung neu beginnen.',
    nextLabel: 'Weiter',
  }
}
