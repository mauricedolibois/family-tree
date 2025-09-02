// src/pages/api/media/delete.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supaAdmin } from '@/lib/supabaseServer'
import { getFamilyIdFromReq } from '@/lib/accounts'

/**
 * Public-URL -> Storage-Key
 * Beispiel-URLs (public bucket):
 *   https://<project>.supabase.co/storage/v1/object/public/media/<fid>/<uuid>-datei.jpg
 * Wir schneiden alles bis ".../media/" ab.
 */
function keyFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url)
    // Pfad sieht etwa so aus: /storage/v1/object/public/media/fid/uuid-name.jpg
    const idx = u.pathname.indexOf('/media/')
    if (idx === -1) return null
    const key = u.pathname.slice(idx + '/media/'.length) // z. B. "fid/uuid-name.jpg"
    return decodeURIComponent(key)
  } catch {
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })

  const { urls } = (req.body || {}) as { urls?: string[] }
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'missing urls' })
  }

  try {
    const keys: string[] = []
    for (const url of urls) {
      const key = keyFromPublicUrl(url)
      if (!key) continue
      // Sicherheitscheck: nur im eigenen Familien-Ordner löschen
      if (!key.startsWith(`${fid}/`)) continue
      keys.push(key)
    }

    if (keys.length === 0) {
      return res.status(200).json({ deleted: 0 })
    }

    const { error } = await supaAdmin.storage.from('media').remove(keys)
    if (error) throw error

    return res.status(200).json({ deleted: keys.length })
  } catch (e: any) {
    console.error('[media/delete] error', e)
    return res.status(500).json({ error: e?.message || 'delete failed' })
  }
}
