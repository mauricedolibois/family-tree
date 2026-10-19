// src/lib/auth.ts
// Who is asking, and what may they do with a tree?

import type { IncomingMessage } from 'http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getUser, roleIn, type Role, type UserRow } from './accounts'
import { sessionFromReq } from './session'
import { logError } from './log'

/** Signed-in user from the session cookie; null for missing, forged, outdated or disabled sessions */
export async function currentUser(req: Pick<IncomingMessage, 'headers'>): Promise<UserRow | null> {
  const session = sessionFromReq(req)
  if (!session) return null
  const user = await getUser(session.uid)
  if (!user || user.disabled_at || user.session_epoch !== session.epoch) return null
  return user
}

export type Access = Role | 'admin'

/** Access to a tree: admins always, others through their membership */
export async function treeAccess(user: Pick<UserRow, 'id' | 'is_admin'>, familyId: string): Promise<Access | null> {
  if (user.is_admin) return 'admin'
  return roleIn(user.id, familyId)
}

export const canEdit = (access: Access | null) => access === 'admin' || access === 'editor'

type Handler<T> = (req: NextApiRequest, res: NextApiResponse, user: UserRow) => Promise<T> | T

/** API route for signed-in users only; unexpected errors become a logged 500 */
export function withUser<T>(name: string, handler: Handler<T>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const user = await currentUser(req)
      if (!user) return res.status(401).json({ error: 'unauthorized' })
      return await handler(req, res, user)
    } catch (err) {
      logError(name, err)
      if (!res.headersSent) res.status(500).json({ error: 'internal error' })
    }
  }
}

/** Like withUser, but for admins only */
export function withAdmin<T>(name: string, handler: Handler<T>) {
  return withUser(name, (req, res, user) => {
    if (!user.is_admin) return res.status(403).json({ error: 'forbidden' })
    return handler(req, res, user)
  })
}

/** First value of a query parameter */
export const queryParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value
