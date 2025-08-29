import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import path from 'path'
import { promises as fs } from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }

  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await fs.mkdir(uploadDir, { recursive: true })

    const form = formidable({
      multiples: true,
      uploadDir,
      keepExtensions: true,
      filename: (_name, _ext, part) => {
        const safe = (part.originalFilename || 'file').replace(
          /[^\w.\-]+/g,
          '_',
        )
        return `${Date.now()}_${safe}`
      },
    })

    const { files } = await new Promise<{
      fields: formidable.Fields
      files: formidable.Files
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) =>
        err ? reject(err) : resolve({ fields, files }),
      )
    })

    // 🔥 alle Felder einsammeln, egal wie sie heißen
    const entries = Object.values(files)
      .flatMap((f: any) => (Array.isArray(f) ? f : [f]))
      .filter(Boolean)

    const urls = entries.map((f: any) => {
      const filename = path.basename(f.filepath || f.path)
      return `/uploads/${filename}`
    })

    return res.status(200).json({ urls })
  } catch (e) {
    console.error('media upload failed:', e)
    return res.status(500).json({ error: 'Upload failed' })
  }
}
