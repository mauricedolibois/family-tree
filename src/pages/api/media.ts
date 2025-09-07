import type { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm, File } from 'formidable'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { supaAdmin } from '@/lib/supabaseServer'
import { getFamilyIdFromReq } from '@/lib/accounts'
import { startApiLog } from '@/lib/apiLogger' // ⬅️ add

export const config = { api: { bodyParser: false } }

type ParsedFiles = { files: File[] }

function parseForm(req: NextApiRequest): Promise<ParsedFiles> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true, keepExtensions: true })
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err)
      const raw = (files as any).file
      const arr: File[] = Array.isArray(raw) ? raw : raw ? [raw] : []
      resolve({ files: arr })
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = startApiLog(req, '/api/media/upload')

  try {
    if (req.method !== 'POST') {
      await log.end(405, { msg: 'method not allowed' })
      return res.status(405).end()
    }

    const fid = getFamilyIdFromReq(req)
    if (!fid) {
      await log.end(401, { error: 'unauthorized' })
      return res.status(401).json({ error: 'unauthorized' })
    }

    const { files } = await parseForm(req)
    if (!files.length) {
      await log.end(400, { error: 'no files', fid })
      return res.status(400).json({ error: 'no files' })
    }

    const urls: string[] = []

    for (const f of files) {
      const filepath = (f as any).filepath || (f as any).path
      const fileBuffer = await fs.promises.readFile(filepath)
      const original = f.originalFilename || 'upload'
      const key = `${fid}/${randomUUID()}-${original.replace(/\s+/g, '_')}`

      const { error: upErr } = await supaAdmin.storage
        .from('media')
        .upload(key, fileBuffer, {
          upsert: false,
          contentType: f.mimetype || undefined,
        })
      if (upErr) throw upErr

      const { data: pub } = supaAdmin.storage.from('media').getPublicUrl(key)
      urls.push(pub.publicUrl)
    }

    await log.end(200, { uploaded: urls.length, fid })
    return res.status(200).json({ urls })
  } catch (e: any) {
    await log.error(e, 500)
    return res.status(500).json({ error: e?.message || 'upload failed' })
  }
}
