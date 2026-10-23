// src/components/tree/ViewModes.tsx
// Switch between the whole family, one line and the relation of two people,
// styled like the index tabs of a book.

import clsx from 'clsx'
import { SlidersHorizontal, X } from 'lucide-react'
import { splitName } from '@/family/format'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'
import { useI18n } from '@/i18n/I18nProvider'

export function ViewModes({
  count,
  scopeOpen,
  onToggleScope,
}: {
  count: number
  scopeOpen: boolean
  onToggleScope: () => void
}) {
  const { index } = useFamily()
  const { lineId, showLine, meId, relation, showRelation, selectedId, select, birthdays } = useView()
  const { notify } = useToast()
  const { t } = useI18n()
  const other = lineId && lineId !== meId ? index.byId.get(lineId) : null

  const openRelation = () => {
    if (relation) return
    // Prefill with you and the currently selected person, where available
    showRelation({ from: meId, to: selectedId && selectedId !== meId ? selectedId : null })
    select(null)
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label={t.views.label}
        className="surface pointer-events-auto flex rounded-full border border-frame/60 p-1 shadow-card"
      >
        <Tab active={!lineId && !relation} onClick={() => showLine(null)}>
          {t.views.wholeFamily}
        </Tab>
        <Tab
          active={!!lineId && lineId === meId}
          onClick={() => (meId ? showLine(meId) : notify({ message: t.views.noMe(t.person.thatsMe) }))}
          disabled={!meId}
        >
          {t.views.myLine}
        </Tab>
        <Tab active={!!relation} onClick={openRelation}>
          {t.views.relation}
        </Tab>
      </div>

      {other && (
        <span className="surface pointer-events-auto flex items-center rounded-full border border-frame/60 pl-3 text-sm text-ink shadow-card">
          <span className="max-w-[10rem] truncate">{t.views.lineOf(splitName(other.name).given || other.name)}</span>
          <button
            type="button"
            onClick={() => showLine(null)}
            aria-label={t.views.showWholeFamily}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      )}

      {lineId && (
        <button
          type="button"
          onClick={onToggleScope}
          aria-expanded={scopeOpen}
          aria-label={t.views.adjustLine}
          title={t.views.adjustLine}
          data-tour="scope"
          className={clsx(
            'pointer-events-auto grid h-10 w-10 place-items-center rounded-full border shadow-card',
            scopeOpen
              ? 'border-accent bg-primary text-on-primary-accent'
              : 'surface border-frame/60 text-ink-muted hover:text-ink',
          )}
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
        </button>
      )}

      {!relation && !scopeOpen && !birthdays && (
        <span className="surface pointer-events-auto hidden rounded-full border border-card-rule px-3 py-1 text-sm tabular-nums text-ink-muted shadow-card sm:inline-block">
          {t.views.people(count)}
        </span>
      )}
    </div>
  )
}

function Tab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={disabled}
      onClick={onClick}
      className={clsx(
        'h-8 whitespace-nowrap rounded-full px-3 text-sm transition-colors sm:px-3.5',
        active
          ? 'bg-primary font-medium text-on-primary-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.5)]'
          : 'text-ink-muted hover:text-ink',
        disabled && 'opacity-55',
      )}
    >
      {children}
    </button>
  )
}
