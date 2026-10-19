// src/components/tree/ViewModes.tsx
// Switch between the whole family, one line and the relation of two people,
// styled like the index tabs of a book.

import clsx from 'clsx'
import { SlidersHorizontal, X } from 'lucide-react'
import { splitName } from '@/family/format'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'

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
        aria-label="Ansicht"
        className="parchment pointer-events-auto flex rounded-full border border-gilt/60 p-1 shadow-card"
      >
        <Tab active={!lineId && !relation} onClick={() => showLine(null)}>
          Ganze Familie
        </Tab>
        <Tab
          active={!!lineId && lineId === meId}
          onClick={() =>
            meId ? showLine(meId) : notify({ message: 'Tippe im Baum auf dich selbst und wähle „Das bin ich“.' })
          }
          disabled={!meId}
        >
          Meine Linie
        </Tab>
        <Tab active={!!relation} onClick={openRelation}>
          Beziehung
        </Tab>
      </div>

      {other && (
        <span className="parchment pointer-events-auto flex items-center rounded-full border border-gilt/60 pl-3 text-sm text-ink shadow-card">
          <span className="max-w-[10rem] truncate">Linie von {splitName(other.name).given || other.name}</span>
          <button
            type="button"
            onClick={() => showLine(null)}
            aria-label="Ganze Familie zeigen"
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
          aria-label="Linie anpassen"
          title="Linie anpassen"
          data-tour="scope"
          className={clsx(
            'pointer-events-auto grid h-10 w-10 place-items-center rounded-full border shadow-card',
            scopeOpen
              ? 'border-gilt bg-linen text-gilt-soft'
              : 'parchment border-gilt/60 text-ink-muted hover:text-ink',
          )}
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
        </button>
      )}

      {!relation && !scopeOpen && !birthdays && (
        <span className="parchment pointer-events-auto hidden rounded-full border border-card-rule px-3 py-1 text-sm tabular-nums text-ink-muted shadow-card sm:inline-block">
          {count} Personen
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
          ? 'bg-linen font-medium text-gilt-soft shadow-[inset_0_0_0_1px_rgb(var(--gilt)/0.5)]'
          : 'text-ink-muted hover:text-ink',
        disabled && 'opacity-55',
      )}
    >
      {children}
    </button>
  )
}
