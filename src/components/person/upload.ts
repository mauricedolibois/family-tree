// src/components/person/upload.ts
// Fotos vor dem Hochladen verkleinern (spart Speicherplatz und Datenvolumen).

import type { MediaKind, StoredMedia } from '@/storage/schema'
import { newId } from '@/family/edit'
import { tr, type Lang } from '@/i18n/lang'

const MAX_EDGE = 2000
const JPEG_QUALITY = 0.86

export function kindOf(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  return 'other'
}

/** Große JPEG/PNG/WebP-Fotos auf max. 2000 px verkleinern; andere Dateien unverändert */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export async function uploadFiles(files: File[], lang: Lang = 'de'): Promise<StoredMedia[]> {
  const t = tr(lang)
  const prepared = await Promise.all(files.map(shrink))
  const form = new FormData()
  for (const f of prepared) form.append('file', f)
  const res = await fetch('/api/media', { method: 'POST', body: form })
  if (res.status === 413)
    throw new Error(t('Die Datei ist zu groß (höchstens 20 MB).', 'The file is too large (20 MB at most).'))
  if (res.status === 400)
    throw new Error(
      t(
        'Dieser Dateityp wird nicht unterstützt. Erlaubt sind Fotos, Videos und PDFs.',
        'This file type isn’t supported. Photos, videos and PDFs are allowed.',
      ),
    )
  if (!res.ok) throw new Error(t('Hochladen fehlgeschlagen.', 'Upload failed.'))
  const { urls } = (await res.json()) as { urls: string[] }
  return urls.map((url, i) => ({
    id: newId(),
    url,
    kind: kindOf(prepared[i]),
    title: files[i].name,
    createdAt: new Date().toISOString(),
  }))
}
