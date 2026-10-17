// src/components/ui/CountryFlag.tsx
// Kleine Flaggen aus reinem CSS (keine Bilder, keine Emojis – die zeigt Windows nicht an).

import clsx from 'clsx'

const SIZES = { sm: 'w-4 h-3', md: 'w-6 h-4', lg: 'w-8 h-5' } as const

type Flag = { title: string; dir: 'row' | 'col'; stripes: string[] } | { title: string; special: 'usa' | 'swiss' }

const FLAGS: Record<string, Flag> = {
  deutschland: { title: 'Deutschland', dir: 'col', stripes: ['#000000', '#DD0000', '#FFCC00'] },
  frankreich: { title: 'Frankreich', dir: 'row', stripes: ['#002395', '#FFFFFF', '#ED2939'] },
  luxemburg: { title: 'Luxemburg', dir: 'col', stripes: ['#EF3340', '#FFFFFF', '#00A3E0'] },
  niederlande: { title: 'Niederlande', dir: 'col', stripes: ['#AE1C28', '#FFFFFF', '#21468B'] },
  österreich: { title: 'Österreich', dir: 'col', stripes: ['#C8102E', '#FFFFFF', '#C8102E'] },
  belgien: { title: 'Belgien', dir: 'row', stripes: ['#000000', '#FDDA24', '#EF3340'] },
  italien: { title: 'Italien', dir: 'row', stripes: ['#009246', '#FFFFFF', '#CE2B37'] },
  polen: { title: 'Polen', dir: 'col', stripes: ['#FFFFFF', '#DC143C'] },
  schweiz: { title: 'Schweiz', special: 'swiss' },
  usa: { title: 'USA', special: 'usa' },
}

const ALIASES: Record<string, string> = {
  germany: 'deutschland',
  france: 'frankreich',
  luxembourg: 'luxemburg',
  netherlands: 'niederlande',
  holland: 'niederlande',
  austria: 'österreich',
  belgium: 'belgien',
  italy: 'italien',
  poland: 'polen',
  switzerland: 'schweiz',
  'vereinigte staaten': 'usa',
  'vereinigte staaten von amerika': 'usa',
  amerika: 'usa',
  'united states': 'usa',
  us: 'usa',
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
  const key = country.toLowerCase().trim()
  const flag = FLAGS[key] ?? FLAGS[ALIASES[key] ?? '']
  if (!flag) return null
  const base = clsx(SIZES[size], 'inline-block shrink-0 overflow-hidden rounded-[2px] ring-1 ring-ink/15', className)

  if ('special' in flag && flag.special === 'usa') {
    return (
      <span
        className={clsx(base, 'relative')}
        title={flag.title}
        style={{ background: 'repeating-linear-gradient(#B22234 0 7.7%, #FFFFFF 7.7% 15.4%)' }}
      >
        <span className="absolute left-0 top-0 h-[54%] w-[42%] bg-[#3C3B6E]" />
      </span>
    )
  }
  if ('special' in flag && flag.special === 'swiss') {
    return (
      <span className={clsx(base, 'relative bg-[#DA291C]')} title={flag.title}>
        <span className="absolute left-1/2 top-1/2 h-[60%] w-[18%] -translate-x-1/2 -translate-y-1/2 bg-white" />
        <span className="absolute left-1/2 top-1/2 h-[22%] w-[48%] -translate-x-1/2 -translate-y-1/2 bg-white" />
      </span>
    )
  }
  if (!('stripes' in flag)) return null
  return (
    <span className={clsx(base, 'flex', flag.dir === 'row' ? 'flex-row' : 'flex-col')} title={flag.title}>
      {flag.stripes.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  )
}

export default CountryFlag
