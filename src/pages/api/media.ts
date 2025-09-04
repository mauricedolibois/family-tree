import type { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm, File } from 'formidable'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { supaAdmin } from '@/lib/supabaseServer'
import { getFamilyIdFromReq } from '@/lib/accounts'

export const config = {
  api: {
    bodyParser: false, // << wichtig für formidable
  },
}

type ParsedFiles = { files: File[] }

function parseForm(req: NextApiRequest): Promise<ParsedFiles> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true, keepExtensions: true })
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err)
      // Normalisieren: 'file' kann File | File[]
      const raw = (files as any).file
      const arr: File[] = Array.isArray(raw) ? raw : raw ? [raw] : []
      resolve({ files: arr })
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })

  try {
    const { files } = await parseForm(req)
    if (!files.length) return res.status(400).json({ error: 'no files' })

    const urls: string[] = []

    for (const f of files) {
      // formidable v3: f.filepath (temp), v2: f.filepath oder f.path — hier f.filepath
      const filepath = (f as any).filepath || (f as any).path
      const fileBuffer = await fs.promises.readFile(filepath)

      // Zielpfad im Bucket: fid/uuid-originalname
      const original = f.originalFilename || 'upload'
      const ext = original.includes('.') ? original.split('.').pop() : ''
      const key = `${fid}/${randomUUID()}-${original.replace(/\s+/g, '_')}`

      // Upload zu Supabase Storage (Bucket 'media')
      const { error: upErr } = await supaAdmin.storage
        .from('media')
        .upload(key, fileBuffer, {
          upsert: false,
          contentType: f.mimetype || undefined,
        })
      if (upErr) throw upErr

      // Public URL holen
      const { data: pub } = supaAdmin.storage.from('media').getPublicUrl(key)
      urls.push(pub.publicUrl)
    }

    return res.status(200).json({ urls })
  } catch (e: any) {
    console.error('[media] upload error', e)
    return res.status(500).json({ error: e?.message || 'upload failed' })
  }
}
// Hilfreiche Links: