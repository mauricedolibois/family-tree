// src/components/person/PersonPanel.tsx
// Info sheet for the selected person: a bottom sheet on phones, a side panel on desktop.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import type { Relation } from '@/family/edit'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { PersonDetails } from './PersonDetails'
import { PersonForm } from './PersonForm'
import { RelativeForm } from './RelativeForm'
import { useI18n } from '@/i18n/I18nProvider'

type Mode = { kind: 'details' } | { kind: 'edit' } | { kind: 'add'; relation: Relation }

export function PersonPanel() {
  const { index } = useFamily()
  const { selectedId, select } = useView()
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>({ kind: 'details' })
  /** On phones: half open (tree stays visible) or fully open */
  const [expanded, setExpanded] = useState(false)
  const pendingEdit = useRef<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Back to the overview when the person changes (except for "complete details")
  useEffect(() => {
    if (selectedId && pendingEdit.current === selectedId) {
      pendingEdit.current = null
      setMode({ kind: 'edit' })
    } else {
      setMode({ kind: 'details' })
    }
    setExpanded(false)
    scroller.current?.scrollTo({ top: 0 })
  }, [selectedId])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    if (mode.kind !== 'details') setExpanded(true)
  }, [mode])

  // Escape closes the sheet or goes back one step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selectedId) return
      if (mode.kind !== 'details') setMode({ kind: 'details' })
      else select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, selectedId, select])

  const person = selectedId ? index.byId.get(selectedId) : undefined
  if (!person) return null

  const back = () => setMode({ kind: 'details' })

  return (
    <aside
      data-tour="sheet"
      aria-label={t.sheet.aboutPerson(person.name)}
      className={
        'surface panel-enter fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-panel border-t border-frame/60 shadow-sheet transition-[max-height] duration-300 ease-settle ' +
        (expanded ? 'max-h-[88dvh] ' : 'max-h-[46dvh] ') +
        'md:absolute md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[420px] md:rounded-panel md:border md:shadow-lifted'
      }
    >
      {/* Frame around the info sheet (gold rule in the classic theme) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-t-[14px] border border-frame/35 md:rounded-[14px]"
      />
      <div className="relative flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
        {mode.kind !== 'details' ? (
          <button
            type="button"
            onClick={back}
            className="flex h-10 items-center gap-1 rounded-full px-2 text-[15px] text-ink-muted hover:bg-canvas-raised hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" /> {t.sheet.back}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? t.sheet.shrink : t.sheet.expand}
            className="absolute left-1/2 top-1 grid h-8 w-20 -translate-x-1/2 place-items-center md:hidden"
          >
            <span className="h-1.5 w-10 rounded-full bg-card-rule" />
          </button>
        )}
        <button
          type="button"
          onClick={() => select(null)}
          aria-label={t.sheet.close}
          className="ml-auto grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={scroller}
        data-tour-scroll
        className="relative overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {mode.kind === 'details' && (
          <PersonDetails
            person={person}
            onEdit={() => setMode({ kind: 'edit' })}
            onAdd={(relation) => setMode({ kind: 'add', relation })}
          />
        )}
        {mode.kind === 'edit' && <PersonForm key={person.id} person={person} onDone={back} />}
        {mode.kind === 'add' && (
          <RelativeForm
            key={`${person.id}-${mode.relation}`}
            person={person}
            relation={mode.relation}
            onDone={back}
            onEditNew={(id) => {
              pendingEdit.current = id
            }}
          />
        )}
      </div>
    </aside>
  )
}
