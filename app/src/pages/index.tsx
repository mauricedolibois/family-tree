// Start page: opens the only or last used tree, otherwise lets the user pick one.
// With ?pick=1 the list is always shown (used by the tree switcher); ?gone=1 also
// says that the tree just opened no longer exists or is no longer accessible.

import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { parse } from 'cookie'
import { ChevronRight, LogOut, Settings, Shield, Trees } from 'lucide-react'
import { treesOf, type TreeSummary } from '@/lib/accounts'
import { LAST_TREE_COOKIE, requirePageUser } from '@/lib/pageAuth'
import { AuthLayout, FormMessage } from '@/components/auth/AuthLayout'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'
import { useI18n } from '@/i18n/I18nProvider'

type Props = { trees: TreeSummary[]; name: string; isAdmin: boolean; gone: boolean; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const auth = await requirePageUser(ctx)
  if (auth.redirect) return { redirect: auth.redirect }
  const { user } = auth
  const trees = await treesOf(user)
  const gone = !!ctx.query.gone
  if (!ctx.query.pick && !gone) {
    const last = ctx.req.headers.cookie ? parse(ctx.req.headers.cookie)[LAST_TREE_COOKIE] : undefined
    const open = trees.length === 1 ? trees[0] : trees.find((t) => t.id === last)
    if (open) return { redirect: { destination: `/tree/${open.id}`, permanent: false } }
  }
  return { props: { trees, name: user.name, isAdmin: user.is_admin, gone, locale: localeFromRequest(ctx.req) } }
}

export default function StartPage({ trees, name, isAdmin, gone }: Props) {
  const { t } = useI18n()
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  const link =
    'flex items-center gap-2 text-[15px] text-ink-muted underline decoration-accent/60 underline-offset-4 hover:text-ink'

  return (
    <AuthLayout title={t.app.title} intro={t.trees.hello(name)}>
      <div className="flex flex-col gap-4">
        {gone && <FormMessage tone="info">{t.trees.gone}</FormMessage>}
        {trees.length === 0 ? (
          <p className="font-text text-[16px] leading-snug text-ink-muted">
            {isAdmin ? t.trees.noneAdmin : t.trees.none}
          </p>
        ) : (
          <>
            <h2 className="field-label">{t.trees.choose}</h2>
            <ul className="flex flex-col gap-2">
              {trees.map((tree) => (
                <li key={tree.id}>
                  <Link
                    href={`/tree/${tree.id}`}
                    className="flex items-center gap-3 rounded-control border border-card-rule bg-card/80 px-3 py-2.5 hover:border-accent hover:bg-card"
                  >
                    <Trees className="h-5 w-5 text-accent-deep" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-text text-[17px] font-semibold text-ink">{tree.name}</span>
                      <span className="block text-[13px] text-ink-muted">{t.roles[tree.role]}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-t border-card-rule pt-3">
          {isAdmin && (
            <Link href="/admin" className={link}>
              <Shield className="h-4 w-4" aria-hidden /> {t.admin.title}
            </Link>
          )}
          <Link href="/account" className={link}>
            <Settings className="h-4 w-4" aria-hidden /> {t.account.title}
          </Link>
          <button type="button" onClick={logout} className={link}>
            <LogOut className="h-4 w-4" aria-hidden /> {t.topBar.logout}
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}
