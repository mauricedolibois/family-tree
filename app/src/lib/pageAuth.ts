// src/lib/pageAuth.ts
// Sign-in checks for getServerSideProps.

import type { GetServerSidePropsContext, Redirect } from 'next'
import { canManage, currentUser, type Access } from './auth'
import { treesOf, type UserRow } from './accounts'
import type { NavContext } from '@/components/app/NavMenu'

/** Only same-site paths, so `next` cannot send people to another site after signing in */
export function safeNext(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?!\/)[^\s\\]*$/.test(value) ? value : null
}

export function loginRedirect(ctx: Pick<GetServerSidePropsContext, 'resolvedUrl'>): { redirect: Redirect } {
  return { redirect: { destination: `/login?next=${encodeURIComponent(ctx.resolvedUrl)}`, permanent: false } }
}

/** The signed-in user, or a redirect to the sign-in page that comes back here afterwards */
export async function requirePageUser(
  ctx: GetServerSidePropsContext,
): Promise<{ user: UserRow; redirect?: undefined } | { user?: undefined; redirect: Redirect }> {
  const user = await currentUser(ctx.req)
  return user ? { user } : loginRedirect(ctx)
}

export const LAST_TREE_COOKIE = 'tree'

/** What the menu on a page may offer the user; with a tree for pages that belong to one */
export async function navContext(user: UserRow, tree?: { id: string; access: Access }): Promise<NavContext> {
  const trees = await treesOf(user)
  return {
    isAdmin: user.is_admin,
    treeCount: trees.length,
    ...(tree
      ? {
          tree: {
            id: tree.id,
            name: trees.find((t) => t.id === tree.id)?.name ?? '',
            canManage: canManage(tree.access),
          },
        }
      : {}),
  }
}
