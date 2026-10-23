// src/components/ui/ThemePicker.tsx
// Choice of design and light/dark, next to the language picker and built the same
// way: native selects work with keyboard, screen readers and phone pickers.

import clsx from 'clsx'
import { Palette, SunMoon } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { useTheme } from '@/themes/ThemeProvider'
import { MODES, THEMES, isMode, isTheme } from '@/themes/themes'

export function ThemePicker({
  className,
  tone = 'paper',
  stacked = false,
}: {
  className?: string
  tone?: 'paper' | 'cover'
  /** Design and light/dark on two rows, for narrow places such as the menu */
  stacked?: boolean
}) {
  const { t } = useI18n()
  const { theme, mode, setTheme, setMode } = useTheme()
  const select = clsx(
    'cursor-pointer rounded-control border bg-transparent py-1 pl-2 pr-7 text-sm',
    tone === 'cover' ? 'border-frame/40 text-on-primary [&>option]:text-ink' : 'border-card-rule text-ink',
  )
  const designSelect = (
    <select
      aria-label={t.theme.design}
      value={theme}
      onChange={(e) => isTheme(e.target.value) && setTheme(e.target.value)}
      className={clsx(select, 'min-w-0 flex-1')}
    >
      {THEMES.map((id) => (
        <option key={id} value={id}>
          {t.theme.names[id]}
        </option>
      ))}
    </select>
  )
  const modeSelect = (
    <select
      aria-label={t.theme.mode}
      value={mode}
      onChange={(e) => isMode(e.target.value) && setMode(e.target.value)}
      className={clsx(select, 'min-w-0 flex-1')}
    >
      {MODES.map((id) => (
        <option key={id} value={id}>
          {t.theme.modes[id]}
        </option>
      ))}
    </select>
  )
  const muted = tone === 'cover' ? 'text-on-primary/75' : 'text-ink-muted'

  if (stacked) {
    return (
      <div className={clsx('flex flex-col gap-2 text-sm', muted, className)}>
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 shrink-0" aria-hidden />
          {designSelect}
        </div>
        <div className="flex items-center gap-2">
          <SunMoon className="h-4 w-4 shrink-0" aria-hidden />
          {modeSelect}
        </div>
      </div>
    )
  }
  return (
    <div className={clsx('inline-flex items-center gap-2 text-sm', muted, className)}>
      <Palette className="h-4 w-4 shrink-0" aria-hidden />
      {designSelect}
      {modeSelect}
    </div>
  )
}
