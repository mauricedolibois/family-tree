// src/components/ui/Choice.tsx
// Choice between a few options (e.g. man/woman) and an on/off switch.

import clsx from 'clsx'
import { useId } from 'react'

type Option<T extends string> = { value: T; label: React.ReactNode }

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  dense,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  /** narrower, for four or more options on phones */
  dense?: boolean
}) {
  const id = useId()
  return (
    <fieldset>
      <legend id={id} className="field-label">
        {label}
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="flex rounded-control border border-card-rule bg-canvas-raised p-1"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex h-9 min-w-0 items-center justify-center gap-2 rounded-[7px] transition-colors',
              // dense: width follows content so long words do not touch the edges
              dense ? 'flex-auto px-2 text-sm' : 'flex-1 text-[15px]',
              value === o.value
                ? 'bg-primary font-medium text-on-primary-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.5)]'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-control border border-card-rule bg-card px-3 py-2.5">
      <span className="text-[15px] text-ink">{children}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-card-rule',
        )}
      >
        <span
          className={clsx(
            'absolute left-0 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}
