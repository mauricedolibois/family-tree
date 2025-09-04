// src/components/Person.tsx
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import Avatar from '@/components/Avatar'
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

  const { name, gender, profile } = member
  const titleImage = profile?.titleImageUrl ?? null

  return (
    <div
      className={clsx(
        'inline-flex flex-col items-center select-none',
        'transition-transform duration-150 ease-out hover:scale-105',
        'rounded-lg border-2 border-[color:var(--color-primary-800)] p-2',
        'bg-[color:var(--color-secondary-100)]',
        className
      )}
      data-testid="person-container"
    >
      <div className="cursor-pointer" onClick={() => openDetails(name)} title={name}>
        <Avatar
          color={gender === Gender.MALE ? 'bg-male' : 'bg-female'}
          imageUrl={titleImage || undefined}
          isDescendant={isDescendant}
          title={name}
        />
      </div>
      {/* Namen weiß */}
      <p className="m-0 mt-1 text-xs text-white">{name}</p>
    </div>
  )
}
