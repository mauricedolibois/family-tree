// src/lib/pageAuth.ts
// Sign-in checks for getServerSideProps.

import type { GetServerSidePropsContext, Redirect } from 'next'
import { currentUser } from './auth'
import type { UserRow } from './accounts'

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
