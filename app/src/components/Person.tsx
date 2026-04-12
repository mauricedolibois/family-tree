import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import Avatar from '@/components/Avatar'
import { CountryFlag } from '@/components/CountryFlag'
import { useSelectedMember } from '@/components/SelectedMemberProvider'
import clsx from 'clsx'

function extractYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const iso = dateStr.match(/^(\d{4})-\d{2}-\d{2}/)
  if (iso) return parseInt(iso[1], 10)
  const german = dateStr.match(/^\d{2}\.\d{2}\.(\d{4})$/)
  if (german) return parseInt(german[1], 10)
  return null
}

interface IPersonProps {
  member: IMember | null
  isDescendant?: boolean
  showBirthYear?: boolean
  className?: string
}

export const Person = ({ member, isDescendant = true, showBirthYear = false, className }: IPersonProps) => {
  const { openDetails } = useSelectedMember()
  if (!member) return null

  const { id, name, gender, profile } = member
  const titleImage = profile?.titleImageUrl ?? null
  const country = profile?.country
  const birthYear = extractYear(profile?.birthDate)
  const deathYear = extractYear(profile?.deathDate)

  return (
    <div
      className={clsx(
        'inline-flex flex-col items-center select-none',
        'transition-transform duration-150 ease-out hover:scale-105',
        'rounded-lg border-2 border-[color:var(--color-primary-800)] p-2',
        className
      )}
      data-testid="person-container"
    >
      {/* Avatar mit Flaggen-Symbol */}
      <div className="relative cursor-pointer" onClick={() => openDetails(id)} title={name}>
        <Avatar
          color={gender === Gender.MALE ? 'bg-male' : 'bg-female'}
          imageUrl={titleImage || undefined}
          isDescendant={isDescendant}
          title={name}
        />
        {/* Flaggen-Symbol oben rechts über dem Avatar */}
        {country && (
          <div className="absolute -top-1 -right-1 z-10">
            <CountryFlag country={country} size="sm" />
          </div>
        )}
      </div>

      <p
        className="
          m-0 mt-1 text-xs text-[color:var(--color-primary-800)]
          text-center leading-snug
          whitespace-normal break-words
          max-w-[100px]
        "
        title={name}
      >
        {name}
      </p>
      {showBirthYear && (birthYear || deathYear) && (
        <p className="m-0 text-[10px] text-[color:var(--color-primary-800)] opacity-60 text-center leading-none">
          {birthYear && deathYear
            ? `* ${birthYear} · † ${deathYear}`
            : birthYear
            ? `* ${birthYear}\u00A0\u00A0`
            : `† ${deathYear}\u00A0\u00A0`}
        </p>
      )}
    </div>
  )
}
