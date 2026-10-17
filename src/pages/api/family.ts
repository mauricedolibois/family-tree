import type { NextApiRequest, NextApiResponse } from 'next'
import { getFamilyIdFromReq } from '@/lib/session'
import { loadFamilyTree, saveFamilyTree, snapshotBeforeSave } from '@/lib/db'
import { logError } from '@/lib/log'
import { setupShanFamilyTree } from '@/utils'
import { serializeFromRoot } from '@/storage/schema'
import { validateStoredTree } from '@/storage/validate'
import { TREE_VERSION_HEADER as VERSION_HEADER } from '@/storage/version'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })

  try {
    if (req.method === 'GET') {
      const loaded = await loadFamilyTree(fid)
      if (loaded) {
        res.setHeader(VERSION_HEADER, loaded.version)
        return res.status(200).json(loaded.tree)
      }
      // Neue Familie: mit einem kleinen Startbaum beginnen
      const starter = serializeFromRoot(setupShanFamilyTree().root)
      const saved = await saveFamilyTree(fid, starter, null)
      if (saved.status === 'conflict') return res.status(409).json({ error: 'conflict' })
      res.setHeader(VERSION_HEADER, saved.version)
      return res.status(200).json(starter)
    }

    if (req.method === 'PUT') {
      const checked = validateStoredTree(req.body)
      if (!checked.ok) return res.status(400).json({ error: 'invalid tree', detail: checked.error })

      const baseVersion = req.headers[VERSION_HEADER]
      if (typeof baseVersion !== 'string' || !baseVersion) {
        return res.status(428).json({ error: 'version required' })
      }

      const current = await loadFamilyTree(fid)
      if (!current) return res.status(404).json({ error: 'not found' })
      if (current.version !== baseVersion) return res.status(409).json({ error: 'conflict' })

      await snapshotBeforeSave(fid, current.tree, checked.tree)
      const saved = await saveFamilyTree(fid, checked.tree, baseVersion)
      if (saved.status === 'conflict') return res.status(409).json({ error: 'conflict' })

      res.setHeader(VERSION_HEADER, saved.version)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, PUT')
    return res.status(405).end()
  } catch (err) {
    logError('api/family', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
