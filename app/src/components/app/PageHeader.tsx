// src/components/app/PageHeader.tsx
// Header of the pages around a tree (members, history, administration, account):
// title, a way back to the tree where there is one, and the same menu as the tree.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { NavMenu, type NavContext, type NavPage } from './NavMenu'

export function PageHeader({ title, nav, current }: { title: string; nav: NavContext; current: NavPage }) {
  const { t } = useI18n()
  return (
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
  )
}
