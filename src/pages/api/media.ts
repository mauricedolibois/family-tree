// src/pages/api/media.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getFamilyIdFromReq, familyUploadDir } from '@/lib/accounts'
import formidable from 'formidable'
import path from 'path'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })
  if (req.method !== 'POST') return res.status(405).end()

  const uploadDir = familyUploadDir(fid)
  const form = formidable({ multiples: true, uploadDir, keepExtensions: true })

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'upload failed' })
    const list = Array.isArray(files.file) ? files.file : [files.file].filter(Boolean)
    const urls: string[] = []
    for (const f of list) {
      const file = f as formidable.File
      const ext = path.extname(file.originalFilename || file.newFilename || '')
      const finalName = file.newFilename // already unique
      const finalPath = path.join(uploadDir, finalName)
      if (file.filepath && file.filepath !== finalPath) {
        try { fs.renameSync(file.filepath, finalPath) } catch { /* already moved */ }
      }
      urls.push(`/uploads/${fid}/${finalName}`)
    }
    res.status(200).json({ urls })
  })
}
