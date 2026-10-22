// src/components/app/TopBar.tsx
// Header of the tree: title, search and menu. Its look comes from the theme
// (slots header-bar and header-rule, e.g. book cloth with gold lettering).

import { useState } from 'react'
import { BookOpen, Cake, Download, Moon, Printer, Search, Sun, X } from 'lucide-react'
import { useFamily } from './FamilyProvider'
import { useView } from './ViewProvider'
import { SearchBox } from './SearchBox'
import { useTheme } from '@/themes/ThemeProvider'
import { MenuItem, NavMenu } from './NavMenu'
import { useI18n } from '@/i18n/I18nProvider'

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

/** The shared menu, with this page's tree actions on top */
function AppMenu({ viewer }: { viewer: Viewer }) {
  const { treeId } = useFamily()
  const { setExportOpen, setTourOpen, showBirthdays, select } = useView()
  const { t } = useI18n()
  const nav = {
    isAdmin: viewer.isAdmin,
    treeCount: viewer.treeCount,
    tree: { id: treeId, canManage: viewer.canManage },
  }

  return (
    <NavMenu nav={nav} current="tree">
      <MenuItem
        icon={<Cake className="h-4 w-4" />}
        onClick={() => {
          select(null)
          showBirthdays(true)
        }}
      >
        {t.topBar.birthdays}
      </MenuItem>
      <MenuItem icon={<Printer className="h-4 w-4" />} onClick={() => setExportOpen(true)}>
        {t.topBar.exportPdf}
      </MenuItem>
      <MenuItem icon={<BookOpen className="h-4 w-4" />} onClick={() => setTourOpen(true)}>
        {t.topBar.startTour}
      </MenuItem>
      {/* The server sends a ZIP file with the tree and its photos; the page stays */}
      <MenuItem
        icon={<Download className="h-4 w-4" />}
        onClick={() => (window.location.href = `/api/trees/${treeId}/download`)}
      >
        {t.topBar.download}
      </MenuItem>
    </NavMenu>
  )
}
