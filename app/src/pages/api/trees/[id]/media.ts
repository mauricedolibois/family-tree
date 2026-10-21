// Uploads photos and documents of a tree (editors, moderators and admins).

import type { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm, type File } from 'formidable'
import fs from 'fs'
import { canEdit, currentUser, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { ALLOWED_TYPES, parseMediaUrl, storeMedia } from '@/lib/media'
import { rememberUpload } from '@/lib/treeScope'
import { logError } from '@/lib/log'

export const config = { api: { bodyParser: false } }

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_FILES = 10

function parseForm(req: NextApiRequest): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: true,
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE_BYTES,
      filter: ({ mimetype }) => !!mimetype && ALLOWED_TYPES.test(mimetype),
    })
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err)
      const raw = (files as Record<string, File | File[] | undefined>).file
      resolve(Array.isArray(raw) ? raw : raw ? [raw] : [])
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  // Checked before reading the body, so nobody without rights can push 20 MB at the server
  let treeId: string | null
  let userId: string
  try {
    const user = await currentUser(req)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    userId = user.id
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
      // The bucket is private; /api/media serves the file to people who may see the tree
      const url = await storeMedia(treeId!, f.originalFilename ?? 'datei', buffer, f.mimetype!)
      // Members limited to a part may open it before it is saved with a person
      const ref = parseMediaUrl(url)
      if (ref) rememberUpload(userId, ref.treeId, ref.file)
      urls.push(url)
    }
    return res.status(200).json({ urls })
  } catch (err) {
    logError('api/trees/[id]/media', err)
    return res.status(500).json({ error: 'upload failed' })
  } finally {
    await Promise.all(files.map((f) => fs.promises.unlink(f.filepath).catch(() => {})))
  }
}
