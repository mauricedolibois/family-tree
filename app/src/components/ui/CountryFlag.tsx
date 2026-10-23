// src/components/ui/CountryFlag.tsx
// Small flags in plain CSS (no images, no emoji flags, which Windows does not render).

import clsx from 'clsx'
import { useI18n } from '@/i18n/I18nProvider'
import { countryName, countryNames } from '@/i18n/countries'

const SIZES = { sm: 'w-4 h-3', md: 'w-6 h-4', lg: 'w-8 h-5' } as const

type Flag = { dir: 'row' | 'col'; stripes: string[] } | { special: 'usa' | 'swiss' }

/** Flags by ISO 3166 code */
const FLAGS: Record<string, Flag> = {
  DE: { dir: 'col', stripes: ['#000000', '#DD0000', '#FFCC00'] },
  FR: { dir: 'row', stripes: ['#002395', '#FFFFFF', '#ED2939'] },
  LU: { dir: 'col', stripes: ['#EF3340', '#FFFFFF', '#00A3E0'] },
  NL: { dir: 'col', stripes: ['#AE1C28', '#FFFFFF', '#21468B'] },
  AT: { dir: 'col', stripes: ['#C8102E', '#FFFFFF', '#C8102E'] },
  BE: { dir: 'row', stripes: ['#000000', '#FDDA24', '#EF3340'] },
  IT: { dir: 'row', stripes: ['#009246', '#FFFFFF', '#CE2B37'] },
  PL: { dir: 'col', stripes: ['#FFFFFF', '#DC143C'] },
  // Yellow twice as wide as the red stripes (1:2:1); coat of arms omitted
  ES: { dir: 'col', stripes: ['#AA151B', '#F1BF00', '#F1BF00', '#AA151B'] },
  CH: { special: 'swiss' },
  US: { special: 'usa' },
}

/** Common names Intl does not produce */
const ALIASES: Record<string, string> = {
  holland: 'NL',
  amerika: 'US',
  america: 'US',
  usa: 'US',
  us: 'US',
  'vereinigte staaten von amerika': 'US',
  'united states of america': 'US',
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

let byName: Map<string, string> | null = null

/** Country code for a stored country name in any supported language, e.g. "Allemagne" → DE */
function codeOf(country: string): string | null {
  if (!byName) {
    byName = new Map(Object.entries(ALIASES))
    for (const code of Object.keys(FLAGS)) for (const name of countryNames(code)) byName.set(normalize(name), code)
  }
  return byName.get(normalize(country)) ?? null
}

export function CountryFlag({
  country,
  className,
  size = 'sm',
}: {
  country: string
  className?: string
  size?: keyof typeof SIZES
}) {
  const { locale } = useI18n()
  const code = codeOf(country)
  const flag = code ? FLAGS[code] : null
  if (!code || !flag) return null
  const title = countryName(code, locale)
  const base = clsx(SIZES[size], 'inline-block shrink-0 overflow-hidden rounded-[2px] ring-1 ring-ink/15', className)

  if ('special' in flag && flag.special === 'usa') {
    return (
      <span
        className={clsx(base, 'relative')}
        title={title}
        style={{ background: 'repeating-linear-gradient(#B22234 0 7.7%, #FFFFFF 7.7% 15.4%)' }}
      >
        <span className="absolute left-0 top-0 h-[54%] w-[42%] bg-[#3C3B6E]" />
      </span>
    )
  }
  if ('special' in flag && flag.special === 'swiss') {
    return (
      <span className={clsx(base, 'relative bg-[#DA291C]')} title={title}>
        <span className="absolute left-1/2 top-1/2 h-[60%] w-[18%] -translate-x-1/2 -translate-y-1/2 bg-white" />
        <span className="absolute left-1/2 top-1/2 h-[22%] w-[48%] -translate-x-1/2 -translate-y-1/2 bg-white" />
      </span>
    )
  }
  if (!('stripes' in flag)) return null
  return (
    <span className={clsx(base, 'flex', flag.dir === 'row' ? 'flex-row' : 'flex-col')} title={title}>
      {flag.stripes.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  )
}

export default CountryFlag
