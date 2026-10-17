// src/components/app/TopBar.tsx
// Kopfzeile wie ein Bucheinband: dunkles Leinen, Titel in Blattgold.

import { useEffect, useRef, useState } from 'react'
import { Download, Flame, LogOut, Menu, Search, Sun, X } from 'lucide-react'
import { useFamily } from './FamilyProvider'
import { SearchBox } from './SearchBox'
import { useTheme } from './useTheme'

export function TopBar() {
  const { familyName } = useFamily()
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
              aria-label="Suche schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 truncate font-display text-[1.6rem] leading-none">
            <span className="mr-2 text-[1.05rem] italic text-gilt-soft/60">Stammbaum</span>
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
            aria-label="Person suchen"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        <AppMenu />
      </div>
    </header>
  )
}

function ThemeButton() {
  const { theme, toggle } = useTheme()
  const night = theme === 'night'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={night}
      aria-label={night ? 'Tageslicht' : 'Kerzenlicht'}
      title={night ? 'Tageslicht' : 'Kerzenlicht'}
      className="grid h-10 w-10 place-items-center rounded-full text-gilt-soft/85 hover:bg-white/10"
    >
      {night ? <Sun className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
    </button>
  )
}

function AppMenu() {
  const { tree, familyName } = useFamily()
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
    a.download = `stammbaum-${familyName.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-')}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/auth'
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menü"
        className="grid h-10 w-10 place-items-center rounded-full text-card/85 hover:bg-white/10"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-card border border-card-rule bg-card p-1 text-ink shadow-lifted"
        >
          <MenuItem icon={<Download className="h-4 w-4" />} onClick={downloadBackup}>
            Sicherung herunterladen
          </MenuItem>
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={logout}>
            Abmelden
          </MenuItem>
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
