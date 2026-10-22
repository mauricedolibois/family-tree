// src/components/app/PageHeader.tsx
// Header of the pages around a tree (members, history, administration, account):
// title, a way back to the tree where there is one, and the same menu as the tree.
// Members, history and administration are tabs of one management area.

import Link from 'next/link'
import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { NavMenu, type NavContext, type NavPage } from './NavMenu'

export function PageHeader({ title, nav, current }: { title: string; nav: NavContext; current: NavPage }) {
  const { t } = useI18n()
  return (
    <>
      <header className="header-bar flex h-14 items-center gap-2 px-3 pt-[env(safe-area-inset-top)] text-on-primary sm:gap-3 sm:px-5">
        {nav.tree && (
          <Link
            href={`/tree/${nav.tree.id}`}
            aria-label={t.nav.toTree}
            title={t.nav.toTree}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-primary/90 hover:bg-on-primary/10"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate font-display text-[1.35rem] text-on-primary-accent">{title}</h1>
        <NavMenu nav={nav} current={current} />
      </header>
      <ManageTabs nav={nav} current={current} />
    </>
  )
}

/** The tabs of the management area; nothing on other pages or with a single tab */
function ManageTabs({ nav, current }: { nav: NavContext; current: NavPage }) {
  const { t } = useI18n()
  const tree = nav.tree?.canManage ? nav.tree : undefined
  const tabs = [
    tree && { page: 'members', href: `/tree/${tree.id}/members`, label: t.manage.tabs.members },
    tree && { page: 'history', href: `/tree/${tree.id}/history`, label: t.manage.tabs.history },
    nav.isAdmin && { page: 'admin', href: tree ? `/admin?tree=${tree.id}` : '/admin', label: t.manage.tabs.admin },
  ].filter((tab): tab is { page: NavPage; href: string; label: string } => !!tab)
  if (tabs.length < 2 || !tabs.some((tab) => tab.page === current)) return null

  return (
    <nav className="border-b border-card-rule bg-card/80">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-3 sm:px-5">
        {tabs.map((tab) => (
          <Link
            key={tab.page}
            href={tab.href}
            aria-current={tab.page === current ? 'page' : undefined}
            className={clsx(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px]',
              tab.page === current
                ? 'border-accent font-semibold text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
