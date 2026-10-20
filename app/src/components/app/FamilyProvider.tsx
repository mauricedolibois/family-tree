// src/components/app/FamilyProvider.tsx
//
// Loads the tree, keeps it in memory and saves changes.
// Saves always carry the loaded version: if the tree was changed elsewhere in
// the meantime, the user gets a notice instead of a silent overwrite.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildIndex, type Tree, type TreeIndex } from '@/family/model'
import { TREE_VERSION_HEADER } from '@/storage/version'
import { useI18n } from '@/i18n/I18nProvider'

export class TreeConflictError extends Error {
  constructor() {
    super('the tree was changed on another device')
  }
}

type Status = 'loading' | 'ready' | 'error'

type FamilyCtx = {
  tree: Tree
  index: TreeIndex
  familyName: string
  treeId: string
  /** Editors and admins may change the tree; viewers only read it */
  canEdit: boolean
  /** Saves exactly this version and then displays it */
  commit: (next: Tree) => Promise<void>
  saving: boolean
}

const Ctx = createContext<FamilyCtx | null>(null)

export function useFamily(): FamilyCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFamily must be used inside FamilyProvider')
  return ctx
}

export function FamilyProvider({
  treeId,
  familyName,
  canEdit,
  children,
}: {
  treeId: string
  familyName: string
  canEdit: boolean
  children: ReactNode
}) {
  const url = `/api/trees/${treeId}`
  const [tree, setTree] = useState<Tree | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const version = useRef<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      // Deleted, or access taken away: the start page says so
      if (res.status === 404) {
        window.location.href = '/?gone=1'
        return
      }
      if (!res.ok) throw new Error(`GET ${url} ${res.status}`)
      version.current = res.headers.get(TREE_VERSION_HEADER)
      setTree((await res.json()) as Tree)
      setConflict(false)
      setStatus('ready')
    } catch (e) {
      console.error('[FamilyProvider] loading failed', e)
      setStatus('error')
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  const commit = useCallback(
    async (next: Tree) => {
      setSaving(true)
      try {
        const res = await fetch(url, {
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
          window.location.href = '/login'
          throw new Error('not signed in')
        }
        if (res.status === 404) {
          window.location.href = '/?gone=1'
          throw new Error('tree gone')
        }
        // Editing rights taken away meanwhile: reload, the page then shows the tree read-only
        if (res.status === 403) {
          window.location.reload()
          throw new Error('read only')
        }
        if (!res.ok) throw new Error(`saving failed (${res.status})`)
        version.current = res.headers.get(TREE_VERSION_HEADER)
        setTree(next)
      } finally {
        setSaving(false)
      }
    },
    [url],
  )

  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree])
  const value = useMemo(
    () => (tree && index ? { tree, index, familyName, treeId, canEdit, commit, saving } : null),
    [tree, index, familyName, treeId, canEdit, commit, saving],
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
  const { t } = useI18n()
  return (
    <div className="desk grid h-dvh place-items-center" role="status" aria-live="polite">
      <div className="parchment flex flex-col items-center gap-4 rounded-panel border border-gilt/50 px-10 py-8 shadow-lifted">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-linen-tint border-t-linen motion-reduce:animate-none" />
        <p className="font-serif text-lg text-ink-muted">{t.family.loading}</p>
      </div>
    </div>
  )
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="desk grid h-dvh place-items-center p-6">
      <div
        className="parchment max-w-sm rounded-panel border border-gilt/50 p-8 text-center shadow-lifted"
        role="alert"
      >
        <p className="font-serif text-xl text-ink">{t.family.loadFailed}</p>
        <p className="mt-2 text-ink-muted">{t.family.loadFailedHint}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-control bg-linen px-5 py-2.5 font-medium text-white hover:bg-linen-hover"
        >
          {t.family.reload}
        </button>
      </div>
    </div>
  )
}

function ConflictBanner({ onReload }: { onReload: () => void }) {
  const { t } = useI18n()
  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-card bg-gilt-soft px-4 py-3 text-sm text-gilt-deep shadow-lifted"
    >
      <span className="flex-1">{t.family.conflict}</span>
      <button
        type="button"
        onClick={onReload}
        className="rounded-control bg-gilt-deep px-3 py-1.5 font-medium text-white"
      >
        {t.family.loadLatest}
      </button>
    </div>
  )
}
