// Uploads photos and documents of a tree (editors and admins).

import type { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm, type File } from 'formidable'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { getSupaAdmin } from '@/lib/supabaseServer'
import { canEdit, currentUser, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { logError } from '@/lib/log'

export const config = { api: { bodyParser: false } }

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_FILES = 10
/** Allowed file types: images, common video formats, PDFs */
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf)$/

function parseForm(req: NextApiRequest): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: true,
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE_BYTES,
      filter: ({ mimetype }) => !!mimetype && ALLOWED.test(mimetype),
    })
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err)
      const raw = (files as Record<string, File | File[] | undefined>).file
      resolve(Array.isArray(raw) ? raw : raw ? [raw] : [])
    })
  })
}

/** Keep only safe characters in file names so storage paths stay clean. */
function safeName(original: string | null): string {
  const cleaned = (original || 'datei')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80)
  return cleaned || 'datei'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  // Checked before reading the body, so nobody without rights can push 20 MB at the server
  let treeId: string | null
  try {
    const user = await currentUser(req)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    treeId = treeIdParam(req.query.id)
    const access = treeId ? await treeAccess(user, treeId) : null
    if (!treeId || !access) return res.status(404).json({ error: 'not found' })
    if (!canEdit(access)) return res.status(403).json({ error: 'read only' })
  } catch (err) {
    logError('api/trees/[id]/media', err)
    return res.status(500).json({ error: 'internal error' })
  }

  let files: File[]
  try {
    files = await parseForm(req)
  } catch (err: any) {
    return res.status(413).json({ error: 'file too large or too many files' })
  }
  if (!files.length) return res.status(400).json({ error: 'no supported files' })

  try {
    const urls: string[] = []
    for (const f of files) {
      const buffer = await fs.promises.readFile(f.filepath)
      const key = `${treeId}/${randomUUID()}-${safeName(f.originalFilename)}`
      const { error } = await getSupaAdmin()
        .storage.from('media')
        .upload(key, buffer, { upsert: false, contentType: f.mimetype || undefined })
      if (error) throw error
      urls.push(getSupaAdmin().storage.from('media').getPublicUrl(key).data.publicUrl)
    }
    return res.status(200).json({ urls })
  } catch (err) {
    logError('api/trees/[id]/media', err)
    return res.status(500).json({ error: 'upload failed' })
  } finally {
    await Promise.all(files.map((f) => fs.promises.unlink(f.filepath).catch(() => {})))
  }
}
