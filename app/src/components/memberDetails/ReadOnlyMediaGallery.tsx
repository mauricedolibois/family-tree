import React from 'react'
import { StoredMedia } from '@/storage/schema'
import { MediaCardClickable } from './MediaCard'

export default function ReadOnlyMediaGallery({ media }: { media: StoredMedia[] }) {
  if (!media.length) return <div className="text-sm text-gray-500">Keine Medien vorhanden.</div>
  return (
    <div>
      <div className="text-sm font-medium mb-1">Medien</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {media.map((m) => (
          <MediaCardClickable key={m.id} media={m} />
        ))}
      </div>
    </div>
  )
}