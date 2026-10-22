// src/components/app/NavMenu.tsx
// The menu behind the ☰ button, the same on every signed-in page: managing this tree
// (moderators), the administration of the server (admins), switching trees, account,
// sign-out, language and design. The two management areas are kept apart: one is
// about this family tree, the other about every tree and account on the server.
// The tree page adds its tree actions on top (children).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, LogOut, Menu, Settings, Shield, Trees, Users } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { ThemePicker } from '@/components/ui/ThemePicker'

/** What the menu may offer; built on the server (lib/pageAuth.ts navContext) */
export type NavContext = {
  isAdmin: boolean
  treeCount: number
  /** The tree the page belongs to, if any */
  tree?: { id: string; name: string; canManage: boolean }
}

/** The page the menu is on, so it does not link to itself; members and history are the tabs of managing a tree */
export type NavPage = 'tree' | 'members' | 'history' | 'account' | 'admin'

export function NavMenu({ nav, current, children }: { nav: NavContext; current: NavPage; children?: ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const go = (href: string) => () => (window.location.href = href)
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  const tree = nav.tree
  const managingTree = current === 'members' || current === 'history'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.topBar.menu}
        data-tour="menu"
        className="grid h-10 w-10 place-items-center rounded-full text-on-primary/85 hover:bg-on-primary/10"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          // Closes when an entry is chosen; entries that stay on the page close it themselves
          onClick={() => setOpen(false)}
          className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-card border border-card-rule bg-card p-1 text-ink shadow-lifted"
        >
          {children}
          {children && <hr className="my-1 border-card-rule" />}
          {tree && current !== 'tree' && (
            <MenuItem icon={<Trees className="h-4 w-4" />} onClick={go(`/tree/${tree.id}`)}>
              {t.nav.toTree}
            </MenuItem>
          )}
          {tree?.canManage && !managingTree && (
            <MenuItem icon={<Users className="h-4 w-4" />} onClick={go(`/tree/${tree.id}/members`)}>
              {t.nav.manageTree(tree.name)}
            </MenuItem>
          )}
          {/* ?tree= keeps the way back to the tree the admin came from */}
          {nav.isAdmin && current !== 'admin' && (
            <MenuItem icon={<Shield className="h-4 w-4" />} onClick={go(tree ? `/admin?tree=${tree.id}` : '/admin')}>
              {t.admin.title}
            </MenuItem>
          )}
          {(nav.treeCount > 1 || !tree) && (
            <MenuItem icon={<ArrowLeftRight className="h-4 w-4" />} onClick={go('/?pick=1')}>
              {tree ? t.topBar.switchTree : t.nav.myTrees}
            </MenuItem>
          )}
          {current !== 'account' && (
            <MenuItem icon={<Settings className="h-4 w-4" />} onClick={go('/account')}>
              {t.account.title}
            </MenuItem>
          )}
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={logout}>
            {t.topBar.logout}
          </MenuItem>
          {/* The pickers are no menu entries: clicks on them keep the menu open */}
          <div
            className="mt-1 flex flex-col gap-2 border-t border-card-rule px-3 pb-1.5 pt-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <LanguagePicker className="w-full [&>select]:min-w-0 [&>select]:flex-1" />
            <ThemePicker className="w-full" stacked />
          </div>
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-[15px] hover:bg-canvas-raised"
    >
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  )
}
