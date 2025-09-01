import React from 'react'
import { StoredMedia } from '@/storage/schema'
import { fileLabel } from './helpers'

export function MediaCardClickable({ media }: { media: StoredMedia }) {
  const label = fileLabel(media)
  const content = (
    <div className="relative w-full h-28 bg-gray-100 flex items-center justify-center">
      {media.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt={label} className="w-full h-full object-cover" />
      ) : media.kind === 'video' ? (
        <video src={media.url} className="w-full h-full object-cover" controls />
      ) : media.kind === 'pdf' ? (
        <div className="flex items-center justify-center text-xs text-gray-700">PDF</div>
      ) : (
        <div className="flex items-center justify-center text-xs text-gray-700">Datei</div>
      )}
    </div>
  )

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      <a href={media.url} target="_blank" rel="noreferrer" title="Öffnen">
        {content}
      </a>
      <div className="px-2 py-2 text-xs text-gray-700 truncate" title={label}>
        {label}
      </div>
    </div>
  )
}