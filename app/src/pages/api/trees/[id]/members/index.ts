// Members and open invitations of one tree, for its moderators and admins

import { listOpenInvites, listTreeMembers } from '@/lib/accounts'
import { managedTree, withUser } from '@/lib/auth'
import { canSendMail } from '@/lib/mail'

export default withUser('api/trees/[id]/members', async (req, res, user) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const [members, invites] = await Promise.all([listTreeMembers(tree.id), listOpenInvites(tree.id)])
  return res.status(200).json({
    tree: { id: tree.id, name: tree.name },
    me: user.id,
    // Admins may change their own membership, moderators not
    meIsAdmin: user.is_admin,
    mail: canSendMail(),
    members,
    // Invitations that also grant admin rights are managed on the admin page
    invites: invites
      .filter((i) => !i.make_admin)
      .map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        scope: i.scope,
        personId: i.person_id,
        inviter: i.inviter_name,
        expiresAt: i.expires_at,
      })),
  })
})
