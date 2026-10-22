// POST restores a version: the whole tree goes back to it. The current version is
// backed up first (kind "restore"), so a restore can be undone the same way.

import { managedTree, withUser } from '@/lib/auth'
import { loadVersion, replaceTree } from '@/lib/db'
import { forgetMissingPeople } from '@/lib/requests'
import { validateStoredTree } from '@/storage/validate'

export default withUser('api/trees/[id]/history/[versionId]', async (req, res, user) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const versionId = Number(req.query.versionId)
  if (!Number.isSafeInteger(versionId) || versionId <= 0) return res.status(400).json({ error: 'invalid id' })
  const version = await loadVersion(tree.id, versionId)
  if (!version) return res.status(404).json({ error: 'not found' })
  // Old versions were saved by older app versions: bring them into today's shape
  const checked = validateStoredTree(version.tree)
  if (!checked.ok) return res.status(422).json({ error: 'invalid version', detail: checked.error })

  await replaceTree(tree.id, checked.tree, {
    kind: 'restore',
    note: `before restoring backup ${versionId}`,
    userId: user.id,
  })
  await forgetMissingPeople(tree.id, checked.tree)
  return res.status(200).json({ ok: true, people: Object.keys(checked.tree.members).length })
})
