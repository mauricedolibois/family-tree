import type { NextApiRequest, NextApiResponse } from 'next'
import { supaAdmin } from '@/lib/supabaseServer'
import { getFamilyIdFromReq } from '@/lib/session'
import { logError } from '@/lib/log'

const MAX_URLS = 200

/** Speicherpfad aus einer öffentlichen Supabase-URL (…/object/public/media/<pfad>) */
function keyFromPublicUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url)
    const marker = '/object/public/media/'
    const idx = pathname.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })

  const { urls } = (req.body || {}) as { urls?: unknown }
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > MAX_URLS) {
    return res.status(400).json({ error: 'missing urls' })
  }

  // Nur Dateien im Ordner der eigenen Familie, keine Pfad-Tricks
  const keys = urls
    .map((u) => (typeof u === 'string' ? keyFromPublicUrl(u) : null))
    .filter((k): k is string => !!k && k.startsWith(`${fid}/`) && !k.includes('..'))

  if (keys.length === 0) return res.status(200).json({ deleted: 0 })

  try {
    const { error } = await supaAdmin.storage.from('media').remove(keys)
    if (error) throw error
    return res.status(200).json({ deleted: keys.length })
  } catch (err) {
    logError('api/media/delete', err)
    return res.status(500).json({ error: 'delete failed' })
  }
}
