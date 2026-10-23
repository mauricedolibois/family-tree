// src/components/ui/Spinner.tsx
// Feedback while something loads or is on its way: a turning ring, a page placeholder
// and a thin bar under the header.

import clsx from 'clsx'
import { useI18n } from '@/i18n/I18nProvider'

/** Turning ring in the current text colour */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none',
        className,
      )}
    />
  )
}

/** Placeholder while a page loads its data */
export function PageLoading() {
  const { t } = useI18n()
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-ink-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary-tint border-t-primary motion-reduce:animate-none" />
      <p className="font-text text-[16px]">{t.auth.wait}</p>
    </div>
  )
}

/** Thin bar at the top of the window while a change is on its way */
export function BusyBar({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div role="progressbar" aria-busy className="fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <div className="busy-bar h-full w-2/5 rounded-full bg-accent" />
    </div>
  )
}
