import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import Avatar from '@/components/Avatar'
import { CountryFlag } from '@/components/CountryFlag'
import { useSelectedMember } from '@/components/SelectedMemberProvider'
import clsx from 'clsx'

interface IPersonProps {
  member: IMember | null
  isDescendant?: boolean
  className?: string
}

export const Person = ({ member, isDescendant = true, className }: IPersonProps) => {
  const { openDetails } = useSelectedMember()
  if (!member) return null

  const { id, name, gender, profile } = member
  const titleImage = profile?.titleImageUrl ?? null
  const country = profile?.country

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
    </div>
  )
}
