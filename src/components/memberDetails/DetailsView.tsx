import React from 'react'
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import { Button } from '@zendeskgarden/react-buttons'
import ReadOnlyMediaGallery from './ReadOnlyMediaGallery'

type Props = {
  member: IMember
  deletable: boolean
  onEdit: () => void
  onAdd: () => void
  onDelete: () => void
}

export default function DetailsView({ member, deletable, onEdit, onAdd, onDelete }: Props) {
  const spouse = member.spouse ?? null
  const children = member.children ?? []
  const media = member.profile?.media ?? []

  return (
    <div className="flex flex-col gap-5 text-left">
      {/* REIHE: Titelbild + Infos (3:4, klein) */}
      <div className="grid grid-cols-[auto,1fr] gap-4 items-start">
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

        <div className="text-sm text-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6">
          <div>
            <span className="font-medium">Geschlecht:</span>{' '}
            {member.gender === Gender.MALE ? 'männlich' : 'weiblich'}
          </div>
          <div>
            <span className="font-medium">Ehepartner:</span> {spouse ? spouse.name : '—'}
          </div>
          <div>
            <span className="font-medium">Kinder:</span>{' '}
            {children.length ? children.map((c) => c.name).join(', ') : '—'}
          </div>
          <div>
            <span className="font-medium">Geburtsdatum:</span>{' '}
            {member.profile?.birthDate || '—'}
          </div>
          <div>
            <span className="font-medium">Todesdatum:</span>{' '}
            {member.profile?.deathDate || '—'}
          </div>
          <div>
            <span className="font-medium">Land:</span> {member.profile?.country || '—'}
          </div>
          <div>
            <span className="font-medium">Wohnort:</span> {member.profile?.city || '—'}
          </div>
          <div className="sm:col-span-2">
            <span className="font-medium">Kommentare:</span>{' '}
            {member.profile?.comments || '—'}
          </div>
        </div>
      </div>

      <ReadOnlyMediaGallery media={media} />

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={onEdit}>Bearbeiten</Button>
        <Button isPrimary onClick={onAdd}>Person hinzufügen</Button>
        <Button
          isDanger
          disabled={!deletable}
          onClick={onDelete}
          title={!deletable ? 'Nur kinderlose Personen (und nicht Root). Paare mit Kindern sind geschützt.' : undefined}
        >
          Person löschen
        </Button>
      </div>
    </div>
  )
}