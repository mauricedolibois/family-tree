import type { NextApiRequest, NextApiResponse } from 'next'
import { readJson, writeJsonAtomic, FAMILY_FILE } from '@/storage/serverFile'
import {
  type StoredTree,
  type StoredTreeV1,
  migrateToV2,
  serializeFromRoot,
} from '@/storage/schema'
import { setupShanFamilyTree } from '@/utils'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === 'GET') {
      // Datei lesen (kann null sein, wenn sie noch nicht existiert)
      const raw = await readJson<StoredTree | StoredTreeV1>(FAMILY_FILE)
      if (!raw) {
        // Seed erzeugen und direkt als v2 speichern
        const seed = setupShanFamilyTree()
        const data = serializeFromRoot(seed.root) // => version:2
        await writeJsonAtomic(FAMILY_FILE, data)
        return res.status(200).json(data)
      }
      // v1 -> v2 migrieren, falls nötig
      const data = migrateToV2(raw)
      if ((raw as any).version !== 2) {
        await writeJsonAtomic(FAMILY_FILE, data)
      }
      return res.status(200).json(data)
    }

    if (req.method === 'PUT') {
      const body = req.body as StoredTree
      if (!body || body.version !== 2 || !body.rootName || !body.members) {
        return res.status(400).json({ error: 'Invalid payload' })
      }
      await writeJsonAtomic(FAMILY_FILE, body)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', ['GET', 'PUT'])
    return res.status(405).end('Method Not Allowed')
  } catch (e) {
    console.error('API /api/family error:', e)
    return res.status(500).json({ error: 'Server error' })
  }
}
