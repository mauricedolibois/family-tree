// src/components/intro/Tour.tsx
//
// Die Einführung: Beim allerersten Besuch (pro Gerät) fragt die Chronik
// „Wer bist du?“ und führt dann Schritt für Schritt durch die App – am eigenen
// Eintrag. Jeder Schritt lässt sich ausprobieren oder überspringen, die ganze
// Einführung jederzeit beenden. Über das Menü lässt sie sich neu starten.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { lifeYears, splitName } from '@/family/format'
import { searchPeople } from '@/family/search'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { Portrait } from '@/components/ui/Portrait'
import { Button } from '@/components/ui/Button'
import { Flourish } from '@/components/ui/Flourish'
import { guestSteps, personalSteps, type Step } from './steps'

const SEEN_KEY = 'stammbaum:einfuehrung'
const HOLE_PAD = 6
const EDGE = 12

type Rect = { x: number; y: number; w: number; h: number }

/** Startet die Einführung beim ersten Besuch und zeigt sie, solange sie läuft */
export function Tour() {
  const { tourOpen, setTourOpen } = useView()

  useEffect(() => {
    let seen = true
    try {
      seen = !!localStorage.getItem(SEEN_KEY)
    } catch {
      /* ohne Speicher lieber nicht jedes Mal stören */
    }
    if (seen) return
    const t = setTimeout(() => setTourOpen(true), 700)
    return () => clearTimeout(t)
  }, [setTourOpen])

  return tourOpen ? <TourRunner /> : null
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* egal */
  }
}

function TourRunner() {
  const { index } = useFamily()
  const view = useView()
  const { meId, setMe, setTourOpen, focusOn, select, showLine, showRelation } = view
  const [me, setChosen] = useState<string | null | undefined>(undefined) // undefined: noch auf der Begrüßung
  const [stepId, setStepId] = useState<string | null>(null)

  const actions = useMemo(
    () => ({ focusOn, select, showLine, showRelation }),
    [focusOn, select, showLine, showRelation],
  )
  const steps = useMemo<Step[]>(() => {
    if (me === undefined) return []
    if (me === null) return guestSteps(actions)
    const p = index.byId.get(me)
    return personalSteps(me, p ? splitName(p.name).given || p.name : '', actions)
  }, [me, index, actions])

  const step = steps.find((s) => s.id === stepId) ?? null
  const position = step ? steps.indexOf(step) : -1

  const close = useCallback(
    (landOnMe: boolean) => {
      markSeen()
      setTourOpen(false)
      if (landOnMe && me) {
        showLine(null)
        focusOn(me)
      }
    },
    [setTourOpen, me, showLine, focusOn],
  )

  const go = useCallback(
    (id: string | undefined) => {
      const next = id ?? steps[position + 1]?.id
      if (next) setStepId(next)
      else close(true)
    },
    [steps, position, close],
  )

  const start = (id: string | null) => {
    if (id) setMe(id)
    setChosen(id)
  }
  // Nach der Wahl mit dem ersten Schritt beginnen
  useEffect(() => {
    if (steps.length && !stepId) setStepId(steps[0].id)
  }, [steps, stepId])

  // Schritt betreten: Aktion ausführen, auf Erledigung achten
  useEffect(() => {
    if (!step) return
    step.enter?.()
    if (!step.doneWhen) return
    const timer = setInterval(() => {
      if (step.doneWhen?.()) go(step.doneTo)
    }, 250)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Wechsel des Schritts
  }, [step?.id])

  // Gesuchtes im Infoblatt in Sicht holen, sobald es da ist
  useEffect(() => {
    if (!step?.scrollTo) return
    const sel = step.scrollTo
    let tries = 0
    const timer = setInterval(() => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (el || ++tries > 20) clearInterval(timer)
      if (el) scrollWithinSheet(el)
    }, 150)
    return () => clearInterval(timer)
  }, [step?.scrollTo, step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (me === undefined) {
    return <Welcome knownId={meId} onPick={start} onGuest={() => start(null)} onSkip={() => close(false)} />
  }
  if (!step) return null

  const skip = () => {
    step.onSkip?.()
    go(step.skipTo)
  }

  return (
    <StepView
      key={step.id}
      step={step}
      position={position}
      total={steps.length}
      onNext={() => go(undefined)}
      onSkip={skip}
      onQuit={() => close(false)}
    />
  )
}

/** Im Infoblatt so scrollen, dass das Element mittig sichtbar ist (die Seite selbst bleibt stehen) */
function scrollWithinSheet(el: HTMLElement) {
  const scroller = el.closest('[data-tour-scroll]') as HTMLElement | null
  if (!scroller) return
  const r = el.getBoundingClientRect()
  const s = scroller.getBoundingClientRect()
  scroller.scrollTo({ top: scroller.scrollTop + (r.top - s.top) - s.height / 2 + r.height / 2, behavior: 'smooth' })
}

// ── Begrüßung: Wer bist du? ──────────────────────────────────────────────────

function Welcome({
  knownId,
  onPick,
  onGuest,
  onSkip,
}: {
  knownId: string | null
  onPick: (id: string) => void
  onGuest: () => void
  onSkip: () => void
}) {
  const { tree, index, familyName } = useFamily()
  const known = knownId ? index.byId.get(knownId) : undefined
  const [searching, setSearching] = useState(!known)
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchPeople(tree, query, 5), [tree, query])
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (searching) input.current?.focus()
  }, [searching])

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-auto bg-linen-deep/70 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-welcome"
        className="parchment gilt-frame panel-enter relative w-full max-w-md px-6 pb-5 pt-7 text-center shadow-lifted"
      >
        <Star className="mx-auto mb-1 h-6 w-6 text-gilt" />
        <h2 id="tour-welcome" className="font-display text-[1.85rem] leading-[1.1] text-ink">
          Willkommen im Stammbaum {familyName}
        </h2>
        <Flourish className="mx-auto my-3 max-w-[14rem]" />

        {!searching && known ? (
          <>
            <p className="font-serif text-[17px] leading-snug text-ink">
              Die Chronik kennt dich schon. Bist du <strong>{known.name}</strong>?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button variant="primary" onClick={() => onPick(known.id)}>
                Ja, das bin ich
              </Button>
              <Button variant="quiet" onClick={() => setSearching(true)}>
                Nein, jemand anderes
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="font-serif text-[17px] leading-snug text-ink">
              Wer bist du? Nenne deinen Namen – dann zeigt dir die Chronik alles an deinem eigenen Eintrag.
            </p>
            <label className="mt-4 block text-left">
              <span className="sr-only">Dein Name</span>
              <input
                ref={input}
                className="field h-12 text-center font-serif text-[18px]"
                placeholder="Dein Vor- oder Nachname"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            {query.trim() && (
              <ul className="mt-2 flex flex-col gap-1.5 text-left">
                {results.length === 0 && (
                  <li className="px-1 py-2 text-center font-serif text-[15px] italic text-ink-muted">
                    Niemand mit diesem Namen in der Chronik.
                  </li>
                )}
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPick(p.id)}
                      className="flex w-full items-center gap-3 rounded-control border border-card-rule bg-card/80 px-2.5 py-2 text-left hover:border-gilt hover:bg-card"
                    >
                      <Portrait person={p} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-base font-semibold text-ink">{p.name}</span>
                        <span className="block truncate font-serif text-[14px] text-ink-muted">
                          {[lifeYears(p), p.profile?.city].filter(Boolean).join(', ')}
                        </span>
                      </span>
                      <span className="text-sm text-gilt-deep">Das bin ich</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={onGuest}
              className="mt-4 font-serif text-[15px] italic text-ink-muted underline decoration-gilt/60 underline-offset-4 hover:text-ink"
            >
              Ich stehe noch nicht im Stammbaum
            </button>
          </>
        )}

        <div className="mt-5 border-t border-card-rule pt-3">
          <button type="button" onClick={onSkip} className="text-sm text-ink-faint hover:text-ink">
            Einführung überspringen
          </button>
        </div>
      </section>
    </div>
  )
}

// ── Ein Schritt: Markierung und Erklärung ────────────────────────────────────

function StepView({
  step,
  position,
  total,
  onNext,
  onSkip,
  onQuit,
}: {
  step: Step
  position: number
  total: number
  onNext: () => void
  onSkip: () => void
  onQuit: () => void
}) {
  const hole = useRect(step.mode === 'spot' ? [step.target, ...(step.also ?? [])] : [])
  const ring = useRect(step.ring ? [step.ring] : [])
  const bubble = (
    <Bubble step={step} position={position} total={total} hole={hole} onNext={onNext} onSkip={onSkip} onQuit={onQuit} />
  )

  if (step.mode === 'modal') {
    return (
      <div className="fixed inset-0 z-[90] grid place-items-center bg-linen-deep/70 p-4 backdrop-blur-[2px]">
        {bubble}
      </div>
    )
  }

  return (
    <>
      {step.mode === 'spot' && <Spotlight hole={hole} />}
      {ring && <GoldRing rect={ring} />}
      {bubble}
    </>
  )
}

/** Abgedunkelte Seite mit leuchtendem, bedienbarem Ausschnitt */
function Spotlight({ hole }: { hole: Rect | null }) {
  if (!hole) {
    // Ziel noch nicht da (z. B. Infoblatt öffnet gerade): alles sperren
    return <div className="fixed inset-0 z-[90] bg-linen-deep/50" />
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const r = {
    x: Math.max(0, hole.x - HOLE_PAD),
    y: Math.max(0, hole.y - HOLE_PAD),
    w: Math.min(vw, hole.w + 2 * HOLE_PAD),
    h: Math.min(vh, hole.h + 2 * HOLE_PAD),
  }
  const block = 'fixed z-[90]'
  return (
    <>
      {/* Sperren rund um den Ausschnitt – der Ausschnitt selbst bleibt bedienbar */}
      <div className={block} style={{ left: 0, top: 0, width: vw, height: r.y }} />
      <div className={block} style={{ left: 0, top: r.y + r.h, width: vw, bottom: 0 }} />
      <div className={block} style={{ left: 0, top: r.y, width: r.x, height: r.h }} />
      <div className={block} style={{ left: r.x + r.w, top: r.y, right: 0, height: r.h }} />
      <div
        aria-hidden
        className="tour-hole pointer-events-none fixed z-[90] rounded-[16px]"
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
      >
        <Star className="sparkle absolute -left-2 -top-2 h-4 w-4 text-gilt-light" />
        <Star className="sparkle absolute -right-2 -top-2 h-3 w-3 text-gilt-light [animation-delay:0.7s]" />
        <Star className="sparkle absolute -bottom-2 -right-2 h-4 w-4 text-gilt-light [animation-delay:1.3s]" />
        <Star className="sparkle absolute -bottom-2 -left-2 h-3 w-3 text-gilt-light [animation-delay:1.9s]" />
      </div>
    </>
  )
}

/** Pulsierender Goldring um das, worauf es ankommt */
function GoldRing({ rect }: { rect: Rect }) {
  return (
    <div
      aria-hidden
      className="tour-ring pointer-events-none fixed z-[91] rounded-[12px]"
      style={{ left: rect.x - 4, top: rect.y - 4, width: rect.w + 8, height: rect.h + 8 }}
    />
  )
}

function Bubble({
  step,
  position,
  total,
  hole,
  onNext,
  onSkip,
  onQuit,
}: {
  step: Step
  position: number
  total: number
  hole: Rect | null
  onNext: () => void
  onSkip: () => void
  onQuit: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(200)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const style = placeBubble(step, hole, height)
  const last = position === total - 1
  // Platzsparend, wenn die Erklärung über dem Geschehen liegt (freies Umsehen, großer Ausschnitt)
  const compact =
    typeof window !== 'undefined' && (step.mode === 'free' || (!!hole && hole.h > window.innerHeight * 0.55))

  return (
    <div
      ref={ref}
      role="dialog"
      aria-live="polite"
      aria-label={step.title}
      className={clsx(
        'parchment gilt-frame z-[92] shadow-lifted',
        compact ? 'px-4 pb-3 pt-2.5' : 'px-5 pb-4 pt-3.5',
        step.mode === 'modal'
          ? 'relative w-full max-w-md text-center'
          : // !fixed: .gilt-frame setzt position: relative
            '!fixed transition-[top,left] duration-300 ease-settle',
      )}
      style={step.mode === 'modal' ? undefined : style}
    >
      <div className={clsx('flex items-center gap-3', step.mode === 'modal' ? 'justify-center' : 'justify-between')}>
        <Progress position={position} total={total} />
        {!last && (
          <button type="button" onClick={onQuit} className="text-[13px] text-ink-faint hover:text-ink">
            Einführung beenden
          </button>
        )}
      </div>

      <h2
        className={clsx(
          'mt-2 flex items-center gap-2 font-display leading-tight text-ink',
          compact ? 'text-[1.2rem]' : 'text-[1.4rem]',
          step.mode === 'modal' && 'justify-center text-[1.75rem]',
        )}
      >
        <Star className="h-4 w-4 shrink-0 text-gilt" />
        {step.title}
      </h2>
      <p className={clsx('mt-1 font-serif leading-snug text-ink', compact ? 'text-[15px]' : 'text-[16.5px]')}>
        {step.text}
      </p>

      <div
        className={clsx(
          'flex items-center gap-3',
          compact ? 'mt-2.5' : 'mt-3.5',
          step.mode === 'modal' ? 'justify-center' : 'justify-between',
        )}
      >
        {step.doneWhen && !step.nextLabel ? (
          <>
            <span className="font-serif text-[14.5px] italic leading-snug text-ink-muted">
              Probier es aus – oder überspring es.
            </span>
            <Button size="sm" onClick={onSkip}>
              Überspringen
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onNext} className={clsx(step.mode !== 'modal' && 'ml-auto')}>
            {step.nextLabel ?? 'Weiter'}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Fortschritt als Goldpunkte, der aktuelle als Raute */
function Progress({ position, total }: { position: number; total: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`Schritt ${position + 1} von ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={clsx(
            'block',
            i === position
              ? 'h-2 w-2 rotate-45 bg-gilt'
              : i < position
              ? 'h-1.5 w-1.5 rounded-full bg-gilt/70'
              : 'h-1.5 w-1.5 rounded-full bg-card-rule',
          )}
        />
      ))}
    </span>
  )
}

/** Wo die Erklärung steht: neben dem Ausschnitt, sonst unten bzw. oben am Rand */
function placeBubble(step: Step, hole: Rect | null, height: number): React.CSSProperties {
  if (typeof window === 'undefined') return {}
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(380, vw - 2 * EDGE)
  const narrow = vw < 768

  if (step.mode === 'free' || !hole) {
    return narrow
      ? { width, left: (vw - width) / 2, top: vh - height - Math.max(EDGE, 20) }
      : { width, left: 16, top: vh - height - 16 }
  }
  const below = hole.y + hole.h + HOLE_PAD + 14
  const above = hole.y - HOLE_PAD - 14 - height
  const left = Math.min(Math.max(EDGE, hole.x + hole.w / 2 - width / 2), vw - width - EDGE)
  if (below + height <= vh - EDGE) return { width, left, top: below }
  if (above >= EDGE) return { width, left, top: above }
  // Großer Ausschnitt (z. B. das ganze Infoblatt): Erklärung oben an den Rand
  return { width, left: (vw - width) / 2, top: EDGE }
}

/** Umriss der passenden Elemente, laufend nachgeführt (Infoblatt gleitet, Baum scrollt …) */
function useRect(selectors: Array<string | undefined>): Rect | null {
  const key = selectors.filter(Boolean).join('|')
  const [rect, setRect] = useState<Rect | null>(null)
  useEffect(() => {
    if (!key) {
      setRect(null)
      return
    }
    let frame = 0
    let last = ''
    const tick = () => {
      const r = unionRect(key.split('|'))
      const sig = r ? `${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.w)}:${Math.round(r.h)}` : ''
      if (sig !== last) {
        last = sig
        setRect(r)
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [key])
  return rect
}

function unionRect(selectors: string[]): Rect | null {
  let box: { l: number; t: number; r: number; b: number } | null = null
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      box = box
        ? {
            l: Math.min(box.l, r.left),
            t: Math.min(box.t, r.top),
            r: Math.max(box.r, r.right),
            b: Math.max(box.b, r.bottom),
          }
        : { l: r.left, t: r.top, r: r.right, b: r.bottom }
      break // pro Selektor das erste sichtbare Element
    }
  }
  return box ? { x: box.l, y: box.t, w: box.r - box.l, h: box.b - box.t } : null
}

/** Vierzackiger Stern wie das Funkeln an der Goldlinie */
function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1 Q13.6 10.4 23 12 Q13.6 13.6 12 23 Q10.4 13.6 1 12 Q10.4 10.4 12 1 Z" fill="currentColor" />
    </svg>
  )
}
