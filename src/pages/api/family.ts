// src/pages/api/family.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { familyDataPath, getFamilyIdFromReq } from '@/lib/accounts'
import { readJSON, writeJSON } from '@/lib/fs'
import { setupShanFamilyTree } from '@/utils'
import { serializeFromRoot } from '@/storage/schema'
import { buildTreeFromStored } from '@/storage/rebuild'
import { serializeTagged } from '@/debug/serializeTagged'
import fs from 'fs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })

  const file = familyDataPath(fid)

if (req.method === 'GET') {
  if (!fs.existsSync(file)) {
    const seed = setupShanFamilyTree()
    //const stored = serializeFromRoot(seed.root)
    const stored = serializeTagged('API-GET-Seed', seed.root)
    await writeJSON(file, stored)
    return res.status(200).json(stored)
  }
  const data = await readJSON(file, null as any)
  return res.status(200).json(data)
}

if (req.method === 'PUT') {
  const body = req.body
  await writeJSON(file, body)
  return res.status(200).json({ ok: true })
}

  return res.status(405).end()
}
