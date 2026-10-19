// src/components/ui/LanguagePicker.tsx
// Language choice as a native select: works with keyboard, screen readers and
// the phone's own picker without extra code.

import clsx from 'clsx'
import { Languages } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { LOCALES, LOCALE_NAMES, isLocale } from '@/i18n/locales'

export function LanguagePicker({ className, tone = 'paper' }: { className?: string; tone?: 'paper' | 'cover' }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <label
      className={clsx(
        'inline-flex items-center gap-2 text-sm',
        tone === 'cover' ? 'text-card/75' : 'text-ink-muted',
        className,
      )}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">{t.common.language}</span>
      <select
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className={clsx(
          'cursor-pointer rounded-control border bg-transparent py-1 pl-2 pr-7 text-sm',
          tone === 'cover' ? 'border-gilt/40 text-card [&>option]:text-ink' : 'border-card-rule text-ink',
        )}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
