// src/components/memberDetails/DetailsView.tsx
import React from 'react'
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import { Button } from '@zendeskgarden/react-buttons'
import ReadOnlyMediaGallery from './ReadOnlyMediaGallery'
import Avatar from '@/components/Avatar'
import { useSelectedMember } from '@/components/SelectedMemberProvider'
import clsx from 'clsx'

type Props = {
  member: IMember
  deletable: boolean
  onEdit: () => void
  onAdd: () => void
  onDelete: () => void
}

/** Kleiner Avatar-Chip für Personenlisten (spouse/parents/children) */
function PersonChip({ person, className }: { person: IMember; className?: string }) {
  const { openDetails } = useSelectedMember()
  const titleImage = person.profile?.titleImageUrl ?? undefined
  const color = person.gender === Gender.MALE ? 'bg-male' : 'bg-female'

  return (
    <button
      type="button"
      onClick={() => openDetails(person.id)}
      className={clsx(
        'group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1',
        'hover:border-[color:var(--color-primary-300)] hover:bg-[color:var(--color-surface-50)] transition',
        'max-w-full',
        className
      )}
      title={person.name}
    >
      <div className="shrink-0">
        <Avatar
          color={color}
          imageUrl={titleImage}
          isDescendant={true}
          title={person.name}
        />
      </div>
      <span className="text-sm text-[color:var(--color-primary-800)] break-words">
        {person.name}
      </span>
    </button>
  )
}

export default function DetailsView({
  member,
  deletable,
  onEdit,
  onAdd,
  onDelete,
}: Props) {
  const spouse = member.spouse ?? null
  const parents = member.parents ?? []
  const children = member.children ?? []
  const media = member.profile?.media ?? []

  const infoItems: Array<{ label: string; value: string }> = []
  if (member.profile?.birthDate) infoItems.push({ label: 'Geburtsdatum', value: member.profile.birthDate })
  if (member.profile?.deathDate) infoItems.push({ label: 'Todesdatum', value: member.profile.deathDate })
  if (member.profile?.country)    infoItems.push({ label: 'Land', value: member.profile.country })
  if (member.profile?.city)       infoItems.push({ label: 'Wohnort', value: member.profile.city })
  if (member.profile?.job)        infoItems.push({ label: 'Beruf', value: member.profile.job })
  if (member.profile?.comments)   infoItems.push({ label: 'Kommentare', value: member.profile.comments })

  return (
    <div className="flex flex-col gap-6 text-left">
      {/* Kopfbereich */}
      <div className="flex gap-4 items-start">
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden w-32">
          <div className="relative aspect-[3/4] bg-gray-100">
        {member.profile?.titleImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.profile.titleImageUrl}
            alt={`${member.name} Titelbild`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            Kein Titelbild
          </div>
        )}
          </div>
        </div>

        <div className="text-sm text-gray-700 space-y-2 flex-1 min-w-0">
          {/* Geschlecht */}
          <div className="grid grid-cols-[max-content_1fr] gap-x-1 items-start min-w-0">
        <span className="shrink-0 whitespace-nowrap font-medium text-[color:var(--color-primary-800)]">Geschlecht:</span>
        <span className="min-w-0 break-words">
          {member.gender === Gender.MALE ? 'männlich' : 'weiblich'}
        </span>
          </div>

            {/* Weitere Infos */}
            {infoItems.length > 0 ? (
            <div className="flex flex-wrap gap-y-2 gap-x-6">
              {infoItems.map(({ label, value }) => {
              const isMultiline = value.includes('\n')
              return (
                <div key={label} className="w-full sm:w-1/2 min-w-0">
                <div className="grid grid-cols-[max-content_1fr] gap-x-1 items-start min-w-0">
                  <span className="shrink-0 whitespace-nowrap font-medium text-[color:var(--color-primary-800)]">
                  {label}:
                  </span>
                  <span
                  className={clsx(
                    'min-w-0 break-words whitespace-pre-wrap',
                    isMultiline && 'col-span-2'
                  )}
                  >
                  {value}
                  </span>
                </div>
                </div>
              )
              })}
            </div>
            ) : (
            <div className="text-xs text-gray-500">Keine weiteren Angaben</div>
            )}
          </div>
          </div>

      {/* Relationen */}
      <div className="flex flex-col gap-3">
        {spouse && (
          <div>
            <div className="font-medium text-[color:var(--color-primary-900)] mb-1">Ehepartner</div>
            <PersonChip person={spouse} />
          </div>
        )}

        {parents.length > 0 && (
          <div>
            <div className="font-medium text-[color:var(--color-primary-900)] mb-1">Eltern</div>
            <div className="flex flex-wrap gap-2">
              {parents.map((p) => (
                <PersonChip key={p.id} person={p} />
              ))}
            </div>
          </div>
        )}

        {children.length > 0 && (
          <div>
            <div className="font-medium text-[color:var(--color-primary-900)] mb-1">Kinder</div>
            <div className="flex flex-wrap gap-2">
              {children.map((c) => (
                <PersonChip key={c.id} person={c} />
              ))}
            </div>
          </div>
        )}
      </div>

      {media.length > 0 && <ReadOnlyMediaGallery media={media} />}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={onEdit}>Bearbeiten</Button>
        <Button isPrimary onClick={onAdd}>Person hinzufügen</Button>
        <Button
          isDanger
          disabled={!deletable}
          onClick={onDelete}
          title={
            !deletable
              ? 'Nur kinderlose Personen (und nicht Root). Paare mit Kindern sind geschützt.'
              : undefined
          }
        >
          Person löschen
        </Button>
      </div>
    </div>
  )
}
