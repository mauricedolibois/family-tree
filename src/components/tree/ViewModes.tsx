// src/components/tree/ViewModes.tsx
// Umschalter zwischen ganzer Familie und einer Linie – wie Register-Reiter eines Buchs.

import clsx from 'clsx'
import { X } from 'lucide-react'
import { splitName } from '@/family/format'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'

export function ViewModes({ count }: { count: number }) {
  const { index } = useFamily()
  const { lineId, showLine, meId } = useView()
  const { notify } = useToast()
  const other = lineId && lineId !== meId ? index.byId.get(lineId) : null

  return (
    <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Ansicht"
        className="parchment pointer-events-auto flex rounded-full border border-gilt/60 p-1 shadow-card"
      >
        <Tab active={!lineId} onClick={() => showLine(null)}>
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
        {other && (
          <span className="flex items-center rounded-full bg-linen pl-3 text-sm text-gilt-soft">
            <span className="max-w-[9rem] truncate">Linie von {splitName(other.name).given || other.name}</span>
            <button
              type="button"
              onClick={() => showLine(null)}
              aria-label="Ganze Familie zeigen"
              className="grid h-8 w-8 place-items-center rounded-full text-gilt-soft/80 hover:text-gilt-light"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>
      <span className="parchment pointer-events-auto rounded-full border border-card-rule px-3 py-1 text-sm tabular-nums text-ink-muted shadow-card">
        {count} Personen
      </span>
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
        'h-8 rounded-full px-3.5 text-sm transition-colors',
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
