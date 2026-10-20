// src/components/ui/ThemePicker.tsx
// Choice of design and light/dark, next to the language picker and built the same
// way: native selects work with keyboard, screen readers and phone pickers.

import clsx from 'clsx'
import { Palette } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { useTheme } from '@/themes/ThemeProvider'
import { MODES, THEMES, isMode, isTheme } from '@/themes/themes'

export function ThemePicker({ className, tone = 'paper' }: { className?: string; tone?: 'paper' | 'cover' }) {
  const { t } = useI18n()
  const { theme, mode, setTheme, setMode } = useTheme()
  const select = clsx(
    'cursor-pointer rounded-control border bg-transparent py-1 pl-2 pr-7 text-sm',
    tone === 'cover' ? 'border-frame/40 text-on-primary [&>option]:text-ink' : 'border-card-rule text-ink',
  )
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 text-sm',
        tone === 'cover' ? 'text-on-primary/75' : 'text-ink-muted',
        className,
      )}
    >
      <Palette className="h-4 w-4 shrink-0" aria-hidden />
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
      <select
        aria-label={t.theme.mode}
        value={mode}
        onChange={(e) => isMode(e.target.value) && setMode(e.target.value)}
        className={select}
      >
        {MODES.map((id) => (
          <option key={id} value={id}>
            {t.theme.modes[id]}
          </option>
        ))}
      </select>
    </div>
  )
}
