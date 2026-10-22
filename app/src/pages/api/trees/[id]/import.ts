// Replace the contents of a tree with an export (ZIP) or a tree JSON. For the
// tree's moderators and admins; the current version is backed up first.

import { managedTree, mayReadAllMedia, withUser } from '@/lib/auth'
import { replaceTree } from '@/lib/db'
import { forgetMissingPeople } from '@/lib/requests'
import { removeMedia } from '@/lib/media'
import { ImportError, prepareImport, readImportRequest, unpackImport } from '@/lib/treeArchive'

export const config = { api: { bodyParser: false } }

export default withUser('api/trees/[id]/import', async (req, res, user) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  // Checked before reading the upload, so nobody without rights can push 200 MB
  const tree = await managedTree(req, res, user)
  if (!tree) return

  const stored: string[] = []
  try {
    const { data } = await readImportRequest(req)
    const mayRead = (id: string) => mayReadAllMedia(user, id)
    const imported = await prepareImport(unpackImport(data), tree.id, mayRead, stored)
    await replaceTree(tree.id, imported, { kind: 'import', note: 'before import', userId: user.id })
    await forgetMissingPeople(tree.id, imported)
    return res.status(200).json({ ok: true, people: Object.keys(imported.members).length })
  } catch (err) {
    await removeMedia(stored).catch(() => {})
    if (err instanceof ImportError) return res.status(err.code === 'too large' ? 413 : 400).json(err.toJSON())
    throw err
  }
})
