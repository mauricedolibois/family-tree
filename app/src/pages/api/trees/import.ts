// A new tree from an export (ZIP) or a tree JSON. Admins only, like creating trees;
// the admin becomes its moderator.

import { createTree, removeTree, setMembership } from '@/lib/accounts'
import { mayReadAllMedia, withAdmin } from '@/lib/auth'
import { saveTree } from '@/lib/db'
import { cleanName } from '@/lib/passwords'
import { ImportError, prepareImport, readImportRequest, unpackImport } from '@/lib/treeArchive'

export const config = { api: { bodyParser: false } }

export default withAdmin('api/trees/import', async (req, res, admin) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  let created: { id: string; name: string } | null = null
  try {
    const { data, fields } = await readImportRequest(req)
    const name = cleanName(fields.name)
    if (!name) return res.status(400).json({ error: 'invalid name' })
    const unpacked = unpackImport(data)
    created = await createTree(name, null)
    const mayRead = (id: string) => mayReadAllMedia(admin, id)
    // Files land in the new tree's folder; removeTree below takes them all on failure
    const imported = await prepareImport(unpacked, created.id, mayRead, [])
    const saved = await saveTree(created.id, imported, null)
    if (saved.status !== 'saved') throw new Error('new tree was filled meanwhile')
    await setMembership(admin.id, created.id, 'moderator')
    return res.status(200).json({ ok: true, tree: created, people: Object.keys(imported.members).length })
  } catch (err) {
    // Nothing half-imported stays behind: the new tree goes with its files
    if (created) await removeTree(created.id).catch(() => {})
    if (err instanceof ImportError) return res.status(err.code === 'too large' ? 413 : 400).json(err.toJSON())
    throw err
  }
})
