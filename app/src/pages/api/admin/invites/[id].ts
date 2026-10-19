// Revoke an open invitation

import { revokeInvite } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { isUuid } from '@/lib/ids'

export default withAdmin('api/admin/invites/[id]', async (req, res) => {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).end()
  }
  if (!isUuid(req.query.id)) return res.status(400).json({ error: 'invalid id' })
  await revokeInvite(req.query.id)
  return res.status(200).json({ ok: true })
})
