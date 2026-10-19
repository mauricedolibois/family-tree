// Change or delete an account: admin rights, disabled state, name.
// The last active admin can neither lose their rights nor be disabled or deleted.

import { bumpSessionEpoch, cleanAdminPatch, countActiveAdmins, deleteUser, getUser, updateUser } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { isUuid } from '@/lib/ids'

export default withAdmin('api/admin/users/[id]', async (req, res, admin) => {
  const id = req.query.id
  if (!isUuid(id)) return res.status(400).json({ error: 'invalid id' })
  const user = await getUser(id)
  if (!user) return res.status(404).json({ error: 'not found' })
  const lastAdmin = user.is_admin && !user.disabled_at && (await countActiveAdmins()) <= 1

  if (req.method === 'PATCH') {
    const patch = cleanAdminPatch(req.body || {})
    if (!patch) return res.status(400).json({ error: 'invalid input' })
    if (lastAdmin && (patch.is_admin === false || patch.disabled_at))
      return res.status(409).json({ error: 'last admin' })
    await updateUser(id, patch)
    // A disabled account must not keep working sessions
    if (patch.disabled_at) await bumpSessionEpoch(id)
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (id === admin.id) return res.status(409).json({ error: 'self' })
    if (lastAdmin) return res.status(409).json({ error: 'last admin' })
    await deleteUser(id)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'PATCH, DELETE')
  return res.status(405).end()
})
