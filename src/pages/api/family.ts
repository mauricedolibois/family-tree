import type { NextApiRequest, NextApiResponse } from 'next'
import { getFamilyIdFromReq } from '@/lib/accounts'
import { loadFamilyTree, saveFamilyTree } from '@/lib/db'
import { setupShanFamilyTree } from '@/utils'
import { serializeFromRoot } from '@/storage/schema'
import { startApiLog } from '@/lib/apiLogger' // ⬅️ add

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = startApiLog(req, '/api/family')
  const fid = getFamilyIdFromReq(req)

  try {
    if (!fid) {
      await log.end(401, { error: 'unauthorized' })
      return res.status(401).json({ error: 'unauthorized' })
    }

    if (req.method === 'GET') {
      const stored = await loadFamilyTree(fid)
      if (stored) {
        await log.end(200, { action: 'GET', fid, hasStored: true, bytes: JSON.stringify(stored).length })
        return res.status(200).json(stored)
      }
      const seed = setupShanFamilyTree()
      const snap = serializeFromRoot(seed.root)
      await saveFamilyTree(fid, snap)
      await log.end(200, { action: 'GET(seed)', fid, bytes: JSON.stringify(snap).length })
      return res.status(200).json(snap)
    }

    if (req.method === 'PUT') {
      await saveFamilyTree(fid, req.body)
      await log.end(200, { action: 'PUT', fid, bytes: JSON.stringify(req.body || {}).length })
      return res.status(200).json({ ok: true })
    }

    await log.end(405, { msg: 'method not allowed' })
    return res.status(405).end()
  } catch (err) {
    await log.error(err, 500, { fid })
    return res.status(500).json({ error: 'internal error' })
  }
}
