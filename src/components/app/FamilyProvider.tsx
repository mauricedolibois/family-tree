// src/components/app/FamilyProvider.tsx
//
// Lädt den Stammbaum, hält ihn im Speicher und speichert Änderungen.
// Gespeichert wird immer mit der geladenen Version: Wurde der Baum
// inzwischen woanders geändert, gibt es einen Hinweis statt stillem Überschreiben.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildIndex, type Tree, type TreeIndex } from '@/family/model'
import { TREE_VERSION_HEADER } from '@/storage/version'
import { useLang } from '@/i18n/lang'

export class TreeConflictError extends Error {
  constructor() {
    super('Der Stammbaum wurde inzwischen auf einem anderen Gerät geändert.')
  }
}

type Status = 'loading' | 'ready' | 'error'

type FamilyCtx = {
  tree: Tree
  index: TreeIndex
  familyName: string
  /** Speichert genau diesen Stand und zeigt ihn danach an */
  commit: (next: Tree) => Promise<void>
  saving: boolean
}

const Ctx = createContext<FamilyCtx | null>(null)

export function useFamily(): FamilyCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFamily außerhalb von FamilyProvider')
  return ctx
}

export function FamilyProvider({ familyName, children }: { familyName: string; children: ReactNode }) {
  const [tree, setTree] = useState<Tree | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const version = useRef<string | null>(null)
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/family', { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/auth'
        return
      }
      if (!res.ok) throw new Error(`GET /api/family ${res.status}`)
      version.current = res.headers.get(TREE_VERSION_HEADER)
      setTree((await res.json()) as Tree)
      setConflict(false)
      setStatus('ready')
    } catch (e) {
      console.error('[FamilyProvider] Laden fehlgeschlagen', e)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const commit = useCallback(async (next: Tree) => {
    setSaving(true)
    try {
      const res = await fetch('/api/family', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(version.current ? { [TREE_VERSION_HEADER]: version.current } : {}),
        },
        body: JSON.stringify(next),
      })
      if (res.status === 409) {
        setConflict(true)
        throw new TreeConflictError()
      }
      if (res.status === 401) {
        window.location.href = '/auth'
        throw new Error(tRef.current('Nicht angemeldet', 'Not logged in'))
      }
      if (!res.ok) throw new Error(`${tRef.current('Speichern fehlgeschlagen', 'Saving failed')} (${res.status})`)
      version.current = res.headers.get(TREE_VERSION_HEADER)
      setTree(next)
    } finally {
      setSaving(false)
    }
  }, [])

  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree])
  const value = useMemo(
    () => (tree && index ? { tree, index, familyName, commit, saving } : null),
    [tree, index, familyName, commit, saving],
  )

  if (status === 'loading' && !value) return <LoadingScreen />
  if (status === 'error' || !value) return <LoadError onRetry={load} />

  return (
    <Ctx.Provider value={value}>
      {conflict && <ConflictBanner onReload={load} />}
      {children}
    </Ctx.Provider>
  )
}

function LoadingScreen() {
  const { t } = useLang()
  return (
    <div className="desk grid h-dvh place-items-center" role="status" aria-live="polite">
      <div className="parchment flex flex-col items-center gap-4 rounded-panel border border-gilt/50 px-10 py-8 shadow-lifted">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-linen-tint border-t-linen motion-reduce:animate-none" />
        <p className="font-serif text-lg text-ink-muted">{t('Stammbaum wird geladen', 'Loading the family tree')}</p>
      </div>
    </div>
  )
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang()
  return (
    <div className="desk grid h-dvh place-items-center p-6">
      <div
        className="parchment max-w-sm rounded-panel border border-gilt/50 p-8 text-center shadow-lifted"
        role="alert"
      >
        <p className="font-serif text-xl text-ink">
          {t('Der Stammbaum konnte nicht geladen werden.', 'The family tree could not be loaded.')}
        </p>
        <p className="mt-2 text-ink-muted">
          {t(
            'Deine Daten sind sicher. Prüfe die Internetverbindung und versuche es noch einmal.',
            'Your data is safe. Check your internet connection and try again.',
          )}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-control bg-linen px-5 py-2.5 font-medium text-white hover:bg-linen-hover"
        >
          {t('Erneut laden', 'Try again')}
        </button>
      </div>
    </div>
  )
}

function ConflictBanner({ onReload }: { onReload: () => void }) {
  const { t } = useLang()
  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-card bg-gilt-soft px-4 py-3 text-sm text-gilt-deep shadow-lifted"
    >
      <span className="flex-1">
        {t(
          'Der Stammbaum wurde inzwischen auf einem anderen Gerät geändert. Deine letzte Änderung wurde nicht gespeichert.',
          'The family tree was changed on another device in the meantime. Your last change was not saved.',
        )}
      </span>
      <button
        type="button"
        onClick={onReload}
        className="rounded-control bg-gilt-deep px-3 py-1.5 font-medium text-white"
      >
        {t('Aktuellen Stand laden', 'Load the latest version')}
      </button>
    </div>
  )
}
