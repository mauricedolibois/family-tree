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
  /** Kalender-Abo der Geburtstage anbieten (für die Linie dieser Person, sonst die ganze Familie) */
  calendar?: { personId: string | null }
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

/** Text in beiden Sprachen: t(deutsch, englisch) */
type T = (de: string, en: string) => string

const exists = (sel: string) => () => !!document.querySelector(sel)
const gone = (sel: string) => () => !document.querySelector(sel)
const click = (sel: string) => () => (document.querySelector(sel) as HTMLElement | null)?.click()

/** Rundgang anhand der eigenen Person */
export function personalSteps(me: string, given: string, a: TourActions, t: T): Step[] {
  return [
    {
      id: 'card',
      mode: 'spot',
      target: `[data-person="${me}"]`,
      enter: () => {
        a.showLine(null)
        a.focusOn(me)
      },
      title: t(`Das bist du, ${given}`, `This is you, ${given}`),
      text: t(
        'Jede Karte ist ein Eintrag in der Chronik. Ein Tippen schlägt das Blatt mit allen Angaben auf – deins liegt schon offen.',
        'Every card is an entry in the chronicle. A tap opens the page with all the details – yours is already open.',
      ),
      nextLabel: t('Weiter', 'Next'),
    },
    {
      id: 'edit',
      mode: 'spot',
      target: '[data-tour="edit"]',
      scrollTo: '[data-tour="edit"]',
      title: t('Schreib in die Chronik', 'Write in the chronicle'),
      text: t(
        'Fehlt etwas oder stimmt etwas nicht? Tippe auf „Bearbeiten“ und ergänze, was du weißt.',
        'Something missing or wrong? Tap “Edit” and add what you know.',
      ),
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
      title: t('Dein Bildnis', 'Your portrait'),
      text: t(
        'Unter „Fotos und Dokumente“ fügst du ein Bild von dir hinzu – es erscheint dann im Medaillon deiner Karte. Trag gern auch Geburtsort oder Beruf ein. Zum Schluss „Speichern“.',
        'Under “Photos and documents” you can add a picture of yourself – it then appears in the medallion on your card. Feel free to add your birthplace or occupation too. Finally, tap “Save”.',
      ),
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
      title: t('Die Chronik wächst', 'The chronicle grows'),
      text: t(
        'Fehlt ein Kind von dir? Hier trägst du es ein – genauso Ehepartner oder Eltern.',
        'Is one of your children missing? Add them here – the same goes for a spouse or parents.',
      ),
      doneWhen: exists('[data-tour="relative-form"]'),
      doneTo: 'child-form',
      skipTo: 'line',
    },
    {
      id: 'child-form',
      mode: 'spot',
      target: '[data-tour="sheet"]',
      title: t('Ein neuer Name', 'A new name'),
      text: t(
        'Name eintragen, Mann oder Frau wählen und „Hinzufügen“ – schon steht es in der Chronik.',
        'Enter a name, choose male or female and tap “Add” – and it’s in the chronicle.',
      ),
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
      title: t('Das ist deine Linie', 'This is your line'),
      text: t(
        'Deine Eltern, Großeltern und alle, die vor ihnen kamen. Schieb und zoom ruhig ein wenig herum.',
        'Your parents, grandparents and everyone who came before them. Feel free to pan and zoom around.',
      ),
      nextLabel: t('Weiter', 'Next'),
    },
    {
      id: 'scope',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      ring: '[data-tour="scope"]',
      title: t('Wie weit soll sie reichen?', 'How far should it reach?'),
      text: t(
        'Mit dem Regler zeigst du mehr oder weniger Generationen – auf Wunsch auch Geschwister und Cousins.',
        'Use this control to show more or fewer generations – and siblings and cousins if you like.',
      ),
      nextLabel: t('Weiter', 'Next'),
    },
    {
      id: 'relation',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      also: ['[data-tour="overlay"] [role="listbox"]'],
      ring: '[data-tour="relation-to"]',
      enter: () => a.showRelation({ from: me, to: null }),
      title: t('Wie sind wir verwandt?', 'How are we related?'),
      text: t(
        'Gib hier eine Person ein, zu der du deine Beziehung wissen willst.',
        'Enter someone here to find out how you are related.',
      ),
      doneWhen: exists('[data-tour="relation-result"]'),
      doneTo: 'relation-result',
      skipTo: 'menu',
    },
    {
      id: 'relation-result',
      mode: 'free',
      title: t('Der Faden zwischen euch', 'The thread between you'),
      text: t(
        'Oben steht, wie ihr verwandt seid. Der Baum zeigt nur noch den Weg von dir zu dieser Person.',
        'Above it says how you are related. The tree now shows only the path from you to this person.',
      ),
      nextLabel: t('Weiter', 'Next'),
    },
    menuStep(a, t),
    calendarStep(me, t),
    {
      id: 'done',
      mode: 'modal',
      title: t('Die Chronik gehört jetzt auch dir', 'The chronicle is yours now too'),
      text: t(
        'Nur Mut: Vor jeder Änderung wird der alte Stand verwahrt. Es geht nichts verloren.',
        'Don’t worry: the previous version is kept before every change. Nothing gets lost.',
      ),
      nextLabel: t('Los geht’s', 'Let’s go'),
    },
  ]
}

/** Rundgang für alle, die (noch) nicht im Baum stehen */
export function guestSteps(a: TourActions, t: T): Step[] {
  return [
    {
      id: 'views',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      enter: () => a.showLine(null),
      title: t('Drei Ansichten', 'Three views'),
      text: t(
        '„Ganze Familie“ zeigt alle, „Meine Linie“ deine Vorfahren und Nachkommen und „Beziehung“ den Weg zwischen zwei Menschen.',
        '“Whole family” shows everyone, “My line” your ancestors and descendants, and “Relationship” the path between two people.',
      ),
      nextLabel: t('Weiter', 'Next'),
    },
    {
      id: 'relation',
      mode: 'spot',
      target: '[data-tour="overlay"]',
      also: ['[data-tour="overlay"] [role="listbox"]'],
      enter: () => a.showRelation({ from: null, to: null }),
      title: t('Wie sind sie verwandt?', 'How are they related?'),
      text: t(
        'Wähle zwei Personen – die Chronik verrät, wie sie zusammengehören.',
        'Pick two people – the chronicle reveals how they belong together.',
      ),
      doneWhen: exists('[data-tour="relation-result"]'),
      doneTo: 'relation-result',
      skipTo: 'menu',
    },
    {
      id: 'relation-result',
      mode: 'free',
      title: t('Der Faden zwischen ihnen', 'The thread between them'),
      text: t(
        'Oben steht, wie die beiden verwandt sind. Der Baum zeigt nur noch den Weg zwischen ihnen.',
        'Above it says how the two are related. The tree now shows only the path between them.',
      ),
      nextLabel: t('Weiter', 'Next'),
    },
    menuStep(a, t),
    calendarStep(null, t),
    {
      id: 'done',
      mode: 'modal',
      title: t('Willkommen in der Chronik', 'Welcome to the chronicle'),
      text: t(
        'Du findest dich noch nicht? Bitte jemanden aus der Familie, dich einzutragen – oder trag dich selbst als Kind deiner Eltern ein. Vor jeder Änderung wird der alte Stand verwahrt.',
        'Can’t find yourself yet? Ask someone in the family to add you – or add yourself as a child of your parents. The previous version is kept before every change.',
      ),
      nextLabel: t('Los geht’s', 'Let’s go'),
    },
  ]
}

function menuStep(a: TourActions, t: T): Step {
  return {
    id: 'menu',
    mode: 'spot',
    target: '[data-tour="menu"]',
    enter: () => a.showLine(null),
    title: t('Suche und Menü', 'Search and menu'),
    text: t(
      'Oben findest du jede Person über die Suche. Im Menü stehen die nächsten Geburtstage, Linien lassen sich als PDF drucken – und diese Einführung neu beginnen.',
      'Use the search at the top to find anyone. The menu has upcoming birthdays, lets you print lines as PDF, switch the language – and restart this tour.',
    ),
    nextLabel: t('Weiter', 'Next'),
  }
}

/** Zum Schluss: Geburtstage in den eigenen Kalender – Linie und Umfang stehen im Link */
function calendarStep(me: string | null, t: T): Step {
  return {
    id: 'calendar',
    mode: 'modal',
    calendar: { personId: me },
    title: t('Kein Geburtstag mehr vergessen', 'Never forget a birthday'),
    text: me
      ? t(
          'Abonniere die Geburtstage deiner Linie in deinem Kalender – mit Erinnerung am Morgen. Neue Einträge kommen von selbst dazu.',
          'Subscribe to your line’s birthdays in your calendar – with a reminder in the morning. New entries appear automatically.',
        )
      : t(
          'Abonniere die Geburtstage der Familie in deinem Kalender – mit Erinnerung am Morgen. Neue Einträge kommen von selbst dazu.',
          'Subscribe to the family’s birthdays in your calendar – with a reminder in the morning. New entries appear automatically.',
        ),
    nextLabel: t('Weiter', 'Next'),
  }
}
