// src/components/app/PageHeader.tsx
// Header of the pages around a tree (managing it, administration, account): title, a
// way back to the tree where there is one, and the same menu as the tree. Managing a
// tree has two tabs, members and history; the administration of the server is a page
// of its own, so the two are never mixed.
//
// Header and tabs stay at the top while the page scrolls, so the way back is always in
// reach. On phones with a notch the bar reaches under the status bar (viewport-fit=cover):
// the safe area is padding on the outer element, the row of buttons keeps its full height.

import Link from 'next/link'
import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { NavMenu, type NavContext, type NavPage } from './NavMenu'

export function PageHeader({ title, nav, current }: { title: string; nav: NavContext; current: NavPage }) {
  const { t } = useI18n()
  return (
    <div className="sticky top-0 z-40">
      <header className="header-bar header-rule pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-on-primary">
        <div className="flex h-14 items-center gap-1 px-2 sm:gap-3 sm:px-5">
          {nav.tree ? (
            <Link
              href={`/tree/${nav.tree.id}`}
              aria-label={t.nav.toTree}
              title={t.nav.toTree}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-primary/90 hover:bg-on-primary/10"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
          ) : (
            <span className="w-1 sm:hidden" aria-hidden />
          )}
          <h1 className="min-w-0 flex-1 truncate font-display text-[1.25rem] leading-tight text-on-primary-accent sm:text-[1.35rem]">
            {title}
          </h1>
          <NavMenu nav={nav} current={current} />
        </div>
      </header>
      <ManageTabs nav={nav} current={current} />
    </div>
  )
}

/** The tabs of managing a tree: members and history; nothing on other pages */
function ManageTabs({ nav, current }: { nav: NavContext; current: NavPage }) {
  const { t } = useI18n()
  const tree = nav.tree?.canManage ? nav.tree : undefined
  if (!tree || (current !== 'members' && current !== 'history')) return null
  const tabs: { page: NavPage; href: string; label: string }[] = [
    { page: 'members', href: `/tree/${tree.id}/members`, label: t.manage.tabs.members },
    { page: 'history', href: `/tree/${tree.id}/history`, label: t.manage.tabs.history },
  ]

  return (
    <nav className="border-b border-card-rule bg-card/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-1 sm:px-5">
        {tabs.map((tab) => (
          <Link
            key={tab.page}
            href={tab.href}
            aria-current={tab.page === current ? 'page' : undefined}
            className={clsx(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] sm:py-2.5',
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
