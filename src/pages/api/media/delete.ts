import type { NextApiRequest, NextApiResponse } from 'next'
import { supaAdmin } from '@/lib/supabaseServer'
import { getFamilyIdFromReq } from '@/lib/accounts'
import { startApiLog } from '@/lib/apiLogger' // ⬅️ add

function keyFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const idx = u.pathname.indexOf('/media/')
    if (idx === -1) return null
    const key = u.pathname.slice(idx + '/media/'.length)
    return decodeURIComponent(key)
  } catch {
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = startApiLog(req, '/api/media/delete')

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

    const { urls } = (req.body || {}) as { urls?: string[] }
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      await log.end(400, { error: 'missing urls' })
      return res.status(400).json({ error: 'missing urls' })
    }

    const keys: string[] = []
    for (const url of urls) {
      const key = keyFromPublicUrl(url)
      if (!key) continue
      if (!key.startsWith(`${fid}/`)) continue
      keys.push(key)
    }

    if (keys.length === 0) {
      await log.end(200, { deleted: 0, filteredOut: true, fid })
      return res.status(200).json({ deleted: 0 })
    }

    const { error } = await supaAdmin.storage.from('media').remove(keys)
    if (error) throw error

    await log.end(200, { deleted: keys.length, fid })
    return res.status(200).json({ deleted: keys.length })
  } catch (e: any) {
    await log.error(e, 500)
    return res.status(500).json({ error: e?.message || 'delete failed' })
  }
}
