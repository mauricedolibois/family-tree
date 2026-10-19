// src/components/person/upload.ts
// Shrink photos before upload (saves storage and mobile data).

import type { MediaKind, StoredMedia } from '@/storage/schema'
import { newId } from '@/family/edit'

const MAX_EDGE = 2000
const JPEG_QUALITY = 0.86

export function kindOf(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  return 'other'
}

/** Scale large JPEG/PNG/WebP photos down to at most 2000 px; other files pass through */
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

export async function uploadFiles(files: File[]): Promise<StoredMedia[]> {
  const prepared = await Promise.all(files.map(shrink))
  const form = new FormData()
  for (const f of prepared) form.append('file', f)
  const res = await fetch('/api/media', { method: 'POST', body: form })
  if (res.status === 413) throw new Error('Die Datei ist zu groß (höchstens 20 MB).')
  if (res.status === 400)
    throw new Error('Dieser Dateityp wird nicht unterstützt. Erlaubt sind Fotos, Videos und PDFs.')
  if (!res.ok) throw new Error('Hochladen fehlgeschlagen.')
  const { urls } = (await res.json()) as { urls: string[] }
  return urls.map((url, i) => ({
    id: newId(),
    url,
    kind: kindOf(prepared[i]),
    title: files[i].name,
    createdAt: new Date().toISOString(),
  }))
}
