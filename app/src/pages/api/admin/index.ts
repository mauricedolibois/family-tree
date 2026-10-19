// Everything the admin page shows: users with their trees, trees, open invitations

import { listOpenInvites, listTrees, listUsers } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { canSendMail } from '@/lib/mail'

export default withAdmin('api/admin', async (req, res, admin) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const [users, trees, invites] = await Promise.all([listUsers(), listTrees(), listOpenInvites()])
  return res.status(200).json({
    me: admin.id,
    mail: canSendMail(),
    users,
    trees,
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      tree: i.tree_name,
      role: i.role,
      admin: i.make_admin,
      inviter: i.inviter_name,
      expiresAt: i.expires_at,
    })),
  })
})
