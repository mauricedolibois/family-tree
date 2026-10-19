// src/components/ui/LanguageSwitch.tsx
// Deutsch / English umschalten. Ohne Wahl gilt die Sprache des Browsers.

import clsx from 'clsx'
import { Languages } from 'lucide-react'
import { useLang, type Lang } from '@/i18n/lang'

const OPTIONS: Array<{ value: Lang; label: string; name: string }> = [
  { value: 'de', label: 'DE', name: 'Deutsch' },
  { value: 'en', label: 'EN', name: 'English' },
]

/** Zeile im Menü: „Sprache  [DE|EN]“ */
export function LanguageSwitch({ tone = 'menu' }: { tone?: 'menu' | 'cover' }) {
  const { lang, setLang, t } = useLang()
  const cover = tone === 'cover'
  return (
    <div
      role="group"
      aria-label={t('Sprache', 'Language')}
      className={clsx('flex items-center gap-3', cover ? 'justify-center' : 'px-3 py-2')}
    >
      {!cover && (
        <>
          <Languages className="h-4 w-4 text-ink-muted" aria-hidden />
          <span className="flex-1 text-[15px]">{t('Sprache', 'Language')}</span>
        </>
      )}
      <span
        className={clsx(
          'flex rounded-full p-0.5',
          cover ? 'border border-gilt/40 bg-black/15' : 'border border-card-rule bg-paper-raised',
        )}
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            lang={o.value}
            aria-pressed={lang === o.value}
            aria-label={o.name}
            title={o.name}
            onClick={() => setLang(o.value)}
            className={clsx(
              'h-8 min-w-[2.75rem] rounded-full px-2.5 text-[13px] font-medium tracking-wide transition-colors',
              lang === o.value
                ? cover
                  ? 'bg-gilt text-linen-deep'
                  : 'bg-linen text-gilt-soft'
                : cover
                ? 'text-gilt-soft/80 hover:text-gilt-soft'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  )
}
