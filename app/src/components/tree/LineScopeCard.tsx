// src/components/tree/LineScopeCard.tsx
// How far a line reaches: generations up and down, collateral lines.

import { useMemo } from 'react'
import { Minus, Plus, Printer, X } from 'lucide-react'
import { lineDepth, type LineScope } from '@/family/model'
import { generations } from '@/family/format'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { Segmented } from '@/components/ui/Choice'
import type { Messages } from '@/i18n/messages'
import { useI18n } from '@/i18n/I18nProvider'

export const sideOptions = (t: Messages): Array<{ value: `${LineScope['side']}`; label: string }> =>
  ([0, 1, 2, 3] as const).map((side) => ({ value: `${side}`, label: t.scope.side[side] }))

export function LineScopeCard({ personId, count, onClose }: { personId: string; count: number; onClose: () => void }) {
  const { index } = useFamily()
  const { lineScope, setLineScope, setExportOpen } = useView()
  const { t } = useI18n()
  const depth = useMemo(() => lineDepth(index, personId), [index, personId])

  return (
    <section
      aria-label={t.views.adjustLine}
      className="surface pointer-events-auto relative w-full rounded-card border border-frame/60 p-3 pt-2 shadow-card md:w-[380px]"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[1.2rem] text-ink">{t.scope.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.sheet.close}
          className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <Stepper
          label={t.scope.ancestors}
          value={lineScope.up}
          max={depth.up}
          onChange={(up) => setLineScope({ ...lineScope, up })}
        />
        <Stepper
          label={t.scope.descendants}
          value={lineScope.down}
          max={depth.down}
          onChange={(down) => setLineScope({ ...lineScope, down })}
        />
      </div>

      <div className="mt-2">
        <Segmented
          dense
          label={t.scope.sideLines}
          value={`${lineScope.side}`}
          options={sideOptions(t)}
          onChange={(v) => setLineScope({ ...lineScope, side: Number(v) as LineScope['side'] })}
        />
        <p className="mt-1.5 text-sm leading-snug text-ink-muted">
          {t.scope.sideHint[lineScope.side]} <span className="tabular-nums">{t.scope.people(count)}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-control border border-frame/60 text-[15px] text-ink hover:bg-accent-soft/40"
      >
        <Printer className="h-4 w-4 text-accent-deep" />
        {t.scope.printLine}
      </button>
    </section>
  )
}

/** Generation count; null means all */
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
  const { t, locale } = useI18n()
  const current = value === null ? max : Math.min(value, max)
  const text =
    max === 0
      ? generations(0, locale)
      : value === null || current >= max
      ? t.scope.allOf(max)
      : generations(current, locale)
  const less = () => onChange(Math.max(0, current - 1))
  const more = () => onChange(current + 1 >= max ? null : current + 1)
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[15px] text-ink">{label}</span>
      <StepButton label={t.scope.less(label)} onClick={less} disabled={max === 0 || current === 0}>
        <Minus className="h-4 w-4" />
      </StepButton>
      <span className="w-[8.5rem] text-center font-text text-[16px] tabular-nums text-ink" aria-live="polite">
        {text}
      </span>
      <StepButton label={t.scope.more(label)} onClick={more} disabled={max === 0 || current >= max}>
        <Plus className="h-4 w-4" />
      </StepButton>
    </div>
  )
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
      className="grid h-10 w-10 place-items-center rounded-full border border-frame/50 text-accent-deep hover:bg-accent-soft/50 disabled:border-card-rule disabled:text-ink-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
