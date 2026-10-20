// Photos and documents of trees: the private storage bucket "media", one folder
// per tree, linked from tree data as /api/media/<tree>/<file>.

import { randomUUID } from 'crypto'
import { getSupaAdmin, supabaseConfig } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'

export const MEDIA_PREFIX = '/api/media/'

/** File types the app accepts and shows inline: images, common video formats, PDFs */
export const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf)$/

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
}

/** Type of an allowed file by its name, or null for anything else */
export function typeFromName(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return TYPE_BY_EXTENSION[ext] ?? null
}

/** Keep only safe characters in file names so storage paths stay clean */
export function safeName(original: string | null): string {
  const cleaned = (original || 'datei')
    .normalize('NFKD')
    // Ü becomes U, not U_ (the accent is a separate character after NFKD)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80)
  return cleaned || 'datei'
}

/** Tree and file of a link to an uploaded file, or null for other links */
export function parseMediaUrl(url: string): { treeId: string; file: string } | null {
  if (!url.startsWith(MEDIA_PREFIX)) return null
  const [treeId, file, ...rest] = url.slice(MEDIA_PREFIX.length).split('?')[0].split('/')
  if (!treeId || !file || rest.length) return null
  try {
    return { treeId: treeId.toLowerCase(), file: decodeURIComponent(file) }
  } catch {
    return null
  }
}

/** Stores a file in the tree's folder under a new unique name; returns its link */
export async function storeMedia(treeId: string, name: string, body: Uint8Array, type: string): Promise<string> {
  const key = `${treeId}/${randomUUID()}-${safeName(name)}`
  const { error } = await getSupaAdmin().storage.from('media').upload(key, body, { upsert: false, contentType: type })
  if (error) throw error
  return MEDIA_PREFIX + key
}

/** Removes stored files by their links (best effort, for cleaning up after a failure) */
export async function removeMedia(links: string[]): Promise<void> {
  const keys = links.flatMap((link) => {
    const ref = parseMediaUrl(link)
    return ref ? [`${ref.treeId}/${ref.file}`] : []
  })
  if (keys.length) await getSupaAdmin().storage.from('media').remove(keys)
}

/** Fetches a stored file from storage; the response status says whether it exists */
export async function openMedia(
  treeId: string,
  file: string,
  init: { headers?: Record<string, string>; method?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const { url, serviceKey } = supabaseConfig()
  return fetch(`${url}/storage/v1/object/authenticated/media/${treeId}/${encodeURIComponent(file)}`, {
    method: init.method ?? 'GET',
    signal: init.signal,
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, ...init.headers },
  })
}

/** Every link to a photo or document in a tree, title images included */
export function mediaUrls(tree: StoredTree): string[] {
  const urls = new Set<string>()
  for (const m of Object.values(tree.members)) {
    if (m.profile?.titleImageUrl) urls.add(m.profile.titleImageUrl)
    for (const item of m.profile?.media ?? []) urls.add(item.url)
  }
  return [...urls]
}

/**
 * A copy of the tree with every media link passed through `map`. Returning null
 * drops the link: media entries disappear, title images are cleared.
 */
export function mapMediaUrls(tree: StoredTree, map: (url: string) => string | null): StoredTree {
  const members = Object.fromEntries(
    Object.entries(tree.members).map(([id, m]) => {
      if (!m.profile) return [id, m]
      const title = m.profile.titleImageUrl ? map(m.profile.titleImageUrl) : null
      const media = (m.profile.media ?? []).flatMap((item) => {
        const url = map(item.url)
        return url ? [{ ...item, url }] : []
      })
      return [id, { ...m, profile: { ...m.profile, titleImageUrl: title, media } }]
    }),
  )
  return { ...tree, members }
}
