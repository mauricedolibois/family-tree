// One tree, for admins:
//   PATCH {name}           rename
//   PATCH {restore: true}  take it back out of the trash
//   DELETE                 move it to the trash (hidden from everyone, restorable)
//   DELETE ?permanent=1    delete a tree in the trash for good, with backups and files

import { purgeTree, renameTree, restoreTree, trashTree } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { cleanName } from '@/lib/passwords'

export default withAdmin('api/admin/trees/[id]', async (req, res) => {
  const id = treeIdParam(req.query.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as { name?: unknown; restore?: unknown }
    if (body.restore === true) {
      if (!(await restoreTree(id))) return res.status(404).json({ error: 'not found' })
      return res.status(200).json({ ok: true })
    }
    const name = cleanName(body.name)
    if (!name) return res.status(400).json({ error: 'invalid name' })
    await renameTree(id, name)
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const done = req.query.permanent === '1' ? await purgeTree(id) : await trashTree(id)
    if (!done) return res.status(404).json({ error: 'not found' })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'PATCH, DELETE')
  return res.status(405).end()
})
