// src/components/tree/LineScopeCard.tsx
// Wie weit die Linie reicht: Generationen nach oben und unten, Seitenlinien.

import { useMemo } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { lineDepth, type LineScope } from '@/family/model'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { Segmented } from '@/components/ui/Choice'

const SIDE_OPTIONS: Array<{ value: `${LineScope['side']}`; label: string }> = [
  { value: '0', label: 'Keine' },
  { value: '1', label: 'Geschwister' },
  { value: '2', label: 'Cousins' },
  { value: '3', label: 'Alle' },
]

const SIDE_HINT: Record<LineScope['side'], string> = {
  0: 'Nur Vorfahren und Nachkommen.',
  1: 'Dazu die Geschwister – auch die der Vorfahren, also Onkel, Tanten und Großonkel.',
  2: 'Dazu deren Kinder: Neffen, Nichten, Cousins und Cousinen.',
  3: 'Alle Blutsverwandten mit ihren Familien.',
}

export function LineScopeCard({ personId, count, onClose }: { personId: string; count: number; onClose: () => void }) {
  const { index } = useFamily()
  const { lineScope, setLineScope } = useView()
  const depth = useMemo(() => lineDepth(index, personId), [index, personId])

  return (
    <section
      aria-label="Linie anpassen"
      className="parchment pointer-events-auto relative w-full rounded-card border border-gilt/60 p-3 pt-2 shadow-card md:w-[380px]"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[1.2rem] text-ink">Wie weit soll die Linie reichen?</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-paper-raised hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <Stepper
          label="Vorfahren"
          value={lineScope.up}
          max={depth.up}
          onChange={(up) => setLineScope({ ...lineScope, up })}
        />
        <Stepper
          label="Nachkommen"
          value={lineScope.down}
          max={depth.down}
          onChange={(down) => setLineScope({ ...lineScope, down })}
        />
      </div>

      <div className="mt-2">
        <Segmented
          dense
          label="Seitenlinien"
          value={`${lineScope.side}`}
          options={SIDE_OPTIONS}
          onChange={(v) => setLineScope({ ...lineScope, side: Number(v) as LineScope['side'] })}
        />
        <p className="mt-1.5 text-sm leading-snug text-ink-muted">
          {SIDE_HINT[lineScope.side]} <span className="tabular-nums">{count} Personen.</span>
        </p>
      </div>
    </section>
  )
}

/** Generationen zählen; null heißt „alle“ */
function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number | null
  max: number
  onChange: (v: number | null) => void
}) {
  const current = value === null ? max : Math.min(value, max)
  const text = max === 0 ? 'keine' : value === null || current >= max ? `alle ${max}` : generations(current)
  const less = () => onChange(Math.max(0, current - 1))
  const more = () => onChange(current + 1 >= max ? null : current + 1)
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[15px] text-ink">{label}</span>
      <StepButton label={`Weniger ${label}`} onClick={less} disabled={max === 0 || current === 0}>
        <Minus className="h-4 w-4" />
      </StepButton>
      <span className="w-[8.5rem] text-center font-serif text-[16px] tabular-nums text-ink" aria-live="polite">
        {text}
      </span>
      <StepButton label={`Mehr ${label}`} onClick={more} disabled={max === 0 || current >= max}>
        <Plus className="h-4 w-4" />
      </StepButton>
    </div>
  )
}

function generations(n: number) {
  if (n === 0) return 'keine'
  return n === 1 ? '1 Generation' : `${n} Generationen`
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-gilt/50 text-gilt-deep hover:bg-gilt-soft/50 disabled:border-card-rule disabled:text-ink-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
