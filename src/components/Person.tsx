// src/components/Person.tsx
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import Avatar from '@/components/Avatar'
import { useSelectedMember } from '@/components/SelectedMemberProvider'

interface IPersonProps {
  member: IMember | null
  isDescendant?: boolean
}

export const Person = ({ member, isDescendant = true }: IPersonProps) => {
  const { openDetails } = useSelectedMember()

  if (!member) return null
  const { name, gender, profile } = member

  // falls Titelbild vorhanden, Avatar damit rendern
  const titleImage = profile?.titleImageUrl ?? null

  return (
    <div
      className="!border-none py-1 px-2 inline-block text-center"
      data-testid="person-container"
    >
      <Avatar
        color={gender === Gender.MALE ? 'bg-male' : 'bg-female'}
        imageUrl={titleImage || undefined}
        onClick={() => openDetails(name)}
        title={name}
        isDescendant={isDescendant}
      />
      <p className="m-0 text-gray-500 text-xs">{name}</p>
    </div>
  )
}
