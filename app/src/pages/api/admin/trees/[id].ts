// Rename a tree

import { renameTree } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { cleanName } from '@/lib/passwords'

export default withAdmin('api/admin/trees/[id]', async (req, res) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).end()
  }
  const id = treeIdParam(req.query.id)
  const name = cleanName((req.body || {}).name)
  if (!id || !name) return res.status(400).json({ error: 'invalid input' })
  await renameTree(id, name)
  return res.status(200).json({ ok: true })
})
