// src/components/CountryFlag.tsx
import clsx from 'clsx'

interface CountryFlagProps {
  country: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Mini-Flaggen-Komponente für Deutschland und Frankreich
 */
export function CountryFlag({ country, className, size = 'sm' }: CountryFlagProps) {
  const normalizedCountry = country.toLowerCase().trim()

  const sizeClasses = {
    sm: 'w-4 h-3',
    md: 'w-6 h-4',
    lg: 'w-8 h-5',
  }

  if (normalizedCountry === 'deutschland' || normalizedCountry === 'germany') {
    return (
      <div
        className={clsx(sizeClasses[size], 'flex flex-col overflow-hidden rounded-[2px] ring-1 ring-ink/15', className)}
        title="Deutschland"
      >
        {/* Deutsche Flagge: Schwarz, Rot, Gold (horizontal) */}
        <div className="flex-1 bg-black" />
        <div className="flex-1 bg-[#DD0000]" />
        <div className="flex-1 bg-[#FFCC00]" />
      </div>
    )
  }

  if (normalizedCountry === 'frankreich' || normalizedCountry === 'france') {
    return (
      <div
        className={clsx(sizeClasses[size], 'flex flex-row overflow-hidden rounded-[2px] ring-1 ring-ink/15', className)}
        title="Frankreich"
      >
        {/* Französische Flagge: Blau, Weiß, Rot (vertikal) */}
        <div className="flex-1 bg-[#002395]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#ED2939]" />
      </div>
    )
  }

  // Unbekanntes Land - keine Flagge anzeigen
  return null
}

export default CountryFlag
