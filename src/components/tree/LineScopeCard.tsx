// src/components/tree/LineScopeCard.tsx
// Wie weit die Linie reicht: Generationen nach oben und unten, Seitenlinien.

import { useMemo } from 'react'
import { Minus, Plus, Printer, X } from 'lucide-react'
import { lineDepth, type LineScope } from '@/family/model'
import { generations } from '@/family/format'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { Segmented } from '@/components/ui/Choice'
import { useLang } from '@/i18n/lang'

/** Wahl der Seitenlinien, auch fürs Kalender-Abo */
export const sideOptions = (
  t: (de: string, en: string) => string,
): Array<{ value: `${LineScope['side']}`; label: string }> => [
  { value: '0', label: t('Keine', 'None') },
  { value: '1', label: t('Geschwister', 'Siblings') },
  { value: '2', label: t('Cousins', 'Cousins') },
  { value: '3', label: t('Alle', 'All') },
]

const sideHint = (side: LineScope['side'], t: (de: string, en: string) => string) =>
  [
    t('Nur Vorfahren und Nachkommen.', 'Only ancestors and descendants.'),
    t(
      'Dazu die Geschwister – auch die der Vorfahren, also Onkel, Tanten und Großonkel.',
      'Plus siblings – including those of the ancestors, so uncles, aunts and great-uncles.',
    ),
    t('Dazu deren Kinder: Neffen, Nichten, Cousins und Cousinen.', 'Plus their children: nephews, nieces and cousins.'),
    t('Alle Blutsverwandten mit ihren Familien.', 'All blood relatives with their families.'),
  ][side]

export function LineScopeCard({ personId, count, onClose }: { personId: string; count: number; onClose: () => void }) {
  const { index } = useFamily()
  const { lineScope, setLineScope, setExportOpen } = useView()
  const { t } = useLang()
  const depth = useMemo(() => lineDepth(index, personId), [index, personId])

  return (
    <section
      aria-label={t('Linie anpassen', 'Adjust the line')}
      className="parchment pointer-events-auto relative w-full rounded-card border border-gilt/60 p-3 pt-2 shadow-card md:w-[380px]"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[1.2rem] text-ink">
          {t('Wie weit soll die Linie reichen?', 'How far should the line reach?')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Schließen', 'Close')}
          className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-paper-raised hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <Stepper
          label={t('Vorfahren', 'Ancestors')}
          value={lineScope.up}
          max={depth.up}
          onChange={(up) => setLineScope({ ...lineScope, up })}
        />
        <Stepper
          label={t('Nachkommen', 'Descendants')}
          value={lineScope.down}
          max={depth.down}
          onChange={(down) => setLineScope({ ...lineScope, down })}
        />
      </div>

      <div className="mt-2">
        <Segmented
          dense
          label={t('Seitenlinien', 'Side branches')}
          value={`${lineScope.side}`}
          options={sideOptions(t)}
          onChange={(v) => setLineScope({ ...lineScope, side: Number(v) as LineScope['side'] })}
        />
        <p className="mt-1.5 text-sm leading-snug text-ink-muted">
          {sideHint(lineScope.side, t)}{' '}
          <span className="tabular-nums">
            {t(`${count} Personen.`, count === 1 ? '1 person.' : `${count} people.`)}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-control border border-gilt/60 text-[15px] text-ink hover:bg-gilt-soft/40"
      >
        <Printer className="h-4 w-4 text-gilt-deep" />
        {t('Diese Linie als PDF', 'This line as PDF')}
      </button>
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
  const { t, lang } = useLang()
  const current = value === null ? max : Math.min(value, max)
  const text =
    max === 0
      ? generations(0, lang)
      : value === null || current >= max
      ? t(`alle ${max}`, `all ${max}`)
      : generations(current, lang)
  const less = () => onChange(Math.max(0, current - 1))
  const more = () => onChange(current + 1 >= max ? null : current + 1)
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[15px] text-ink">{label}</span>
      <StepButton
        label={t(`Weniger ${label}`, `Fewer ${label.toLowerCase()}`)}
        onClick={less}
        disabled={max === 0 || current === 0}
      >
        <Minus className="h-4 w-4" />
      </StepButton>
      <span className="w-[8.5rem] text-center font-serif text-[16px] tabular-nums text-ink" aria-live="polite">
        {text}
      </span>
      <StepButton
        label={t(`Mehr ${label}`, `More ${label.toLowerCase()}`)}
        onClick={more}
        disabled={max === 0 || current >= max}
      >
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
      className="grid h-10 w-10 place-items-center rounded-full border border-gilt/50 text-gilt-deep hover:bg-gilt-soft/50 disabled:border-card-rule disabled:text-ink-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
