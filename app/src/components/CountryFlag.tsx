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
        className={clsx(
          sizeClasses[size],
          'rounded-[2px] shadow-sm border border-gray-300 overflow-hidden flex flex-col',
          className
        )}
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
        className={clsx(
          sizeClasses[size],
          'rounded-[2px] shadow-sm border border-gray-300 overflow-hidden flex flex-row',
          className
        )}
        title="Frankreich"
      >
        {/* Französische Flagge: Blau, Weiß, Rot (vertikal) */}
        <div className="flex-1 bg-[#002395]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#ED2939]" />
      </div>
    )
  }

  if (normalizedCountry === 'spanien' || normalizedCountry === 'spain') {
    return (
      <div
        className={clsx(
          sizeClasses[size],
          'rounded-[2px] shadow-sm border border-gray-300 overflow-hidden flex flex-col',
          className
        )}
        title="Spanien"
      >
        {/* Spanische Flagge: Rot, Gelb, Rot (horizontal, 1:2:1) */}
        <div className="h-[25%] bg-[#AA151B]" />
        <div className="h-[50%] bg-[#F1BF00]" />
        <div className="h-[25%] bg-[#AA151B]" />
      </div>
    )
  }

  // Unbekanntes Land - keine Flagge anzeigen
  return null
}

export default CountryFlag
