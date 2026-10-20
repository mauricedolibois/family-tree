// src/components/app/TopBar.tsx
// Header of the tree: title, search and menu. Its look comes from the theme
// (slots header-bar and header-rule, e.g. book cloth with gold lettering).

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  BookOpen,
  Cake,
  Download,
  Moon,
  History,
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
import { useTheme } from '@/themes/ThemeProvider'
import { useI18n } from '@/i18n/I18nProvider'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { ThemePicker } from '@/components/ui/ThemePicker'

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
    <header className="header-bar header-rule relative z-50 shrink-0 pt-[env(safe-area-inset-top)] text-on-primary">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-4 sm:px-5">
        {mobileSearch ? (
          <div className="flex flex-1 items-center gap-2 md:hidden">
            <div className="flex-1">
              <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearch(false)}
              className="grid h-10 w-10 place-items-center rounded-full text-on-primary/80 hover:bg-on-primary/10"
              aria-label={t.topBar.closeSearch}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 truncate font-display text-[1.6rem] leading-none">
            <span className="mr-2 text-[1.05rem] italic text-on-primary-accent/60">{t.app.title}</span>
            <span className="title-text">{familyName}</span>
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
            className="grid h-10 w-10 place-items-center rounded-full text-on-primary/85 hover:bg-on-primary/10 md:hidden"
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

/** Quick switch between light and dark; the full choice is in the menu */
function ThemeButton() {
  const { dark, setMode } = useTheme()
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={() => setMode(dark ? 'light' : 'dark')}
      aria-pressed={dark}
      aria-label={dark ? t.theme.toLight : t.theme.toDark}
      title={dark ? t.theme.toLight : t.theme.toDark}
      className="grid h-10 w-10 place-items-center rounded-full text-on-primary-accent/85 hover:bg-on-primary/10"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

function AppMenu({ viewer }: { viewer: Viewer }) {
  const { treeId } = useFamily()
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
        className="grid h-10 w-10 place-items-center rounded-full text-on-primary/85 hover:bg-on-primary/10"
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
          <MenuItem
            icon={<Download className="h-4 w-4" />}
            onClick={() => {
              // The server sends a ZIP file with the tree and its photos; the page stays
              window.location.href = `/api/trees/${treeId}/download`
              setOpen(false)
            }}
          >
            {t.topBar.download}
          </MenuItem>
          {viewer.treeCount > 1 && (
            <MenuItem icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => (window.location.href = '/?pick=1')}>
              {t.topBar.switchTree}
            </MenuItem>
          )}
          {viewer.canManage && (
            <>
              <MenuItem
                icon={<Users className="h-4 w-4" />}
                onClick={() => (window.location.href = `/tree/${treeId}/members`)}
              >
                {t.members.title}
              </MenuItem>
              <MenuItem
                icon={<History className="h-4 w-4" />}
                onClick={() => (window.location.href = `/tree/${treeId}/history`)}
              >
                {t.history.title}
              </MenuItem>
            </>
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
          <div className="mt-1 flex flex-col gap-2 border-t border-card-rule px-3 pb-1.5 pt-2.5">
            <LanguagePicker className="w-full justify-between" />
            <ThemePicker className="w-full" />
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
      className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-[15px] hover:bg-canvas-raised"
    >
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  )
}
