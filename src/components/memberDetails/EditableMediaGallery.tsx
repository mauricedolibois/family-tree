import React from 'react'
import { StoredMedia } from '@/storage/schema'
import { fileLabel } from './helpers'
import { ChipButton, ChipDangerButton } from './ChipButtons'

export default function EditableMediaGallery({
  media,
  onSetTitle,
  onRemove,
}: {
  media: StoredMedia[]
  onSetTitle: (url: string) => void
  onRemove: (id: string) => void
}) {
  if (!media.length) return <div className="text-sm text-gray-500">Noch keine Medien hinzugefügt.</div>
  return (
    <div>
      <div className="text-sm font-medium mb-1">
        Medien (Änderungen werden beim Speichern übernommen)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {media.map((m) => {
          const label = fileLabel(m)
          const preview =
            m.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={label} className="w-full h-full object-cover" />
            ) : m.kind === 'video' ? (
              <video src={m.url} className="w-full h-full object-cover" controls />
            ) : m.kind === 'pdf' ? (
              <div className="flex items-center justify-center text-xs text-gray-700">PDF</div>
            ) : (
              <div className="flex items-center justify-center text-xs text-gray-700">Datei</div>
            )

          return (
            <div key={m.id} className="border rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                title="Öffnen"
                className="relative w-full h-28 bg-gray-100 flex items-center justify-center"
              >
                {preview}
              </a>
              <div className="px-2 py-2 text-xs text-gray-700 truncate" title={label}>
                {label}
              </div>
              <div className="px-2 pb-2 flex flex-wrap items-center gap-1">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                >
                  Öffnen
                </a>
                {m.kind === 'image' && (
                  <ChipButton onClick={() => onSetTitle(m.url)}>Als Titelbild</ChipButton>
                )}
                <ChipDangerButton className="ml-auto" onClick={() => onRemove(m.id!)}>
                  Entfernen
                </ChipDangerButton>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}