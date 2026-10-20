// src/components/app/TopBar.tsx
// Header styled like a book cover: dark linen, title in gold leaf.

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  BookOpen,
  Cake,
  Download,
  Flame,
  LogOut,
  Menu,
  Printer,
  Search,
  Settings,
  Shield,
  Users,
  Sun,
  X,
} from 'lucide-react'
import { useFamily } from './FamilyProvider'
import { useView } from './ViewProvider'
import { SearchBox } from './SearchBox'
import { useTheme } from './useTheme'
import { useI18n } from '@/i18n/I18nProvider'
import { LanguagePicker } from '@/components/ui/LanguagePicker'

/** The signed-in person, as far as the header needs to know */
export type Viewer = {
  name: string
  isAdmin: boolean
  treeCount: number
  /** Moderator of this tree or admin: may invite people and manage members */
  canManage: boolean
}

export function TopBar({ viewer }: { viewer: Viewer }) {
  const { familyName } = useFamily()
  const { t } = useI18n()
  const [mobileSearch, setMobileSearch] = useState(false)

  return (
    <header className="book-cover relative z-50 shrink-0 pt-[env(safe-area-inset-top)] text-card shadow-[0_1px_0_rgb(var(--gilt)/0.7),0_3px_0_rgb(var(--linen-deep)),0_4px_0_rgb(var(--gilt)/0.35)]">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-4 sm:px-5">
        {mobileSearch ? (
          <div className="flex flex-1 items-center gap-2 md:hidden">
            <div className="flex-1">
              <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearch(false)}
              className="grid h-10 w-10 place-items-center rounded-full text-card/80 hover:bg-white/10"
              aria-label={t.topBar.closeSearch}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 truncate font-display text-[1.6rem] leading-none">
            <span className="mr-2 text-[1.05rem] italic text-gilt-soft/60">{t.app.title}</span>
            <span className="gilt-text">{familyName}</span>
          </h1>
        )}

        <div className="hidden w-80 md:block lg:w-96">
          <SearchBox />
        </div>

        {!mobileSearch && <ThemeButton />}
        {!mobileSearch && (
          <button
            type="button"
            onClick={() => setMobileSearch(true)}
            className="grid h-10 w-10 place-items-center rounded-full text-card/85 hover:bg-white/10 md:hidden"
            aria-label={t.topBar.searchPerson}
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        <AppMenu viewer={viewer} />
      </div>
    </header>
  )
}

function ThemeButton() {
  const { theme, toggle } = useTheme()
  const { t } = useI18n()
  const night = theme === 'night'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={night}
      aria-label={night ? t.topBar.daylight : t.topBar.candlelight}
      title={night ? t.topBar.daylight : t.topBar.candlelight}
      className="grid h-10 w-10 place-items-center rounded-full text-gilt-soft/85 hover:bg-white/10"
    >
      {night ? <Sun className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
    </button>
  )
}

function AppMenu({ viewer }: { viewer: Viewer }) {
  const { tree, familyName, treeId } = useFamily()
  const { setExportOpen, setTourOpen, showBirthdays, select } = useView()
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

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(tree, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t.topBar.backupFile}-${familyName.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-')}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.topBar.menu}
        data-tour="menu"
        className="grid h-10 w-10 place-items-center rounded-full text-card/85 hover:bg-white/10"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-card border border-card-rule bg-card p-1 text-ink shadow-lifted"
        >
          <MenuItem
            icon={<Cake className="h-4 w-4" />}
            onClick={() => {
              setOpen(false)
              select(null)
              showBirthdays(true)
            }}
          >
            {t.topBar.birthdays}
          </MenuItem>
          <MenuItem
            icon={<Printer className="h-4 w-4" />}
            onClick={() => {
              setOpen(false)
              setExportOpen(true)
            }}
          >
            {t.topBar.exportPdf}
          </MenuItem>
          <MenuItem
            icon={<BookOpen className="h-4 w-4" />}
            onClick={() => {
              setOpen(false)
              setTourOpen(true)
            }}
          >
            {t.topBar.startTour}
          </MenuItem>
          <MenuItem icon={<Download className="h-4 w-4" />} onClick={downloadBackup}>
            {t.topBar.downloadBackup}
          </MenuItem>
          {viewer.treeCount > 1 && (
            <MenuItem icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => (window.location.href = '/?pick=1')}>
              {t.topBar.switchTree}
            </MenuItem>
          )}
          {viewer.canManage && (
            <MenuItem
              icon={<Users className="h-4 w-4" />}
              onClick={() => (window.location.href = `/tree/${treeId}/members`)}
            >
              {t.members.title}
            </MenuItem>
          )}
          <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => (window.location.href = '/account')}>
            {t.account.title}
          </MenuItem>
          {viewer.isAdmin && (
            <MenuItem icon={<Shield className="h-4 w-4" />} onClick={() => (window.location.href = '/admin')}>
              {t.admin.title}
            </MenuItem>
          )}
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={logout}>
            {t.topBar.logout}
          </MenuItem>
          <div className="mt-1 border-t border-card-rule px-3 pb-1.5 pt-2.5">
            <LanguagePicker className="w-full justify-between" />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-[15px] hover:bg-paper-raised"
    >
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  )
}
