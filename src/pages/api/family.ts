// src/pages/api/family.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getFamilyIdFromReq } from '@/lib/accounts'
import { loadFamilyTree, saveFamilyTree } from '@/lib/db'
import { setupShanFamilyTree } from '@/utils'
import { serializeFromRoot } from '@/storage/schema'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })

  if (req.method === 'GET') {
    const stored = await loadFamilyTree(fid)
    if (stored) return res.status(200).json(stored)
    const seed = setupShanFamilyTree()
    const snap = serializeFromRoot(seed.root)
    await saveFamilyTree(fid, snap)
    return res.status(200).json(snap)
  }

  if (req.method === 'PUT') {
    await saveFamilyTree(fid, req.body)
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
