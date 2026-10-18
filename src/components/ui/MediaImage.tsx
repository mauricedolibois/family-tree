// src/components/ui/MediaImage.tsx
// Foto aus der Sammlung einer Person. Fehlt die Datei, steht dort ein Hinweis statt eines kaputten Bildes.

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

export function MediaImage({ src, alt, lazy = true }: { src: string; alt: string; lazy?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null)
  if (broken === src) {
    return (
      <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-ink-muted">
        <ImageOff className="h-6 w-6" aria-hidden />
        Bild fehlt
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={lazy ? 'lazy' : undefined}
      className="h-full w-full object-cover"
      onError={() => setBroken(src)}
    />
  )
}
