// src/components/app/FamilyProvider.tsx
//
// Loads the tree, keeps it in memory and saves changes.
// Saves always carry the loaded version: if the tree was changed elsewhere in
// the meantime, the user gets a notice instead of a silent overwrite.
// Members limited to a part of the tree get their part from the server (header
// x-tree-scope); canEditPerson tells which people they may change.

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildIndex, type Tree, type TreeIndex } from '@/family/model'
import { TREE_VERSION_HEADER } from '@/storage/version'
import { decodeScope, OutsideScopeError, scopeSets, TREE_SCOPE_HEADER, type TreeScope } from '@/family/scope'
import { useI18n } from '@/i18n/I18nProvider'

export class TreeConflictError extends Error {
  constructor() {
    super('the tree was changed on another device')
  }
}

type Status = 'loading' | 'ready' | 'error' | 'scope gone'

export type Undo = () => Promise<void>

type FamilyCtx = {
  tree: Tree
  index: TreeIndex
  familyName: string
  treeId: string
  /** Editors may change the tree (or their part of it); viewers only read it */
  canEdit: boolean
  /** May change this person: always for editors of the whole tree, within their part otherwise */
  canEditPerson: (id: string) => boolean
  /** The part of the tree the member is limited to; null for the whole tree */
  scope: TreeScope | null
  /**
   * Saves exactly this version and then displays it. Returns a function that
   * saves the version from before again, for an "Undo" right after the change.
   */
  commit: (next: Tree) => Promise<Undo>
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
  const [scope, setScope] = useState<TreeScope | null>(null)
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
      // The start person of the member's part was removed
      if (res.status === 403) {
        setStatus('scope gone')
        return
      }
      if (!res.ok) throw new Error(`GET ${url} ${res.status}`)
      version.current = res.headers.get(TREE_VERSION_HEADER)
      setScope(decodeScope(res.headers.get(TREE_SCOPE_HEADER)))
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

  // The tree as last saved, for undoing the next change
  const current = useRef<Tree | null>(null)
  useEffect(() => {
    current.current = tree
  }, [tree])

  const commit = useCallback(
    async (next: Tree): Promise<Undo> => {
      const before = current.current
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
        if (res.status === 403) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
          if (body.error === 'outside scope') throw new OutsideScopeError(body.detail)
          // Editing rights taken away meanwhile: reload, the page then shows the tree read-only
          window.location.reload()
          throw new Error('read only')
        }
        if (!res.ok) throw new Error(`saving failed (${res.status})`)
        version.current = res.headers.get(TREE_VERSION_HEADER)
        current.current = next
        setTree(next)
      } finally {
        setSaving(false)
      }
      // A normal save of the earlier version: if someone else changed the tree
      // meanwhile, it ends in the usual conflict notice instead of overwriting them
      return async () => {
        if (before) await commitRef.current(before)
      }
    },
    [url],
  )
  const commitRef = useRef(commit)
  commitRef.current = commit

  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree])
  // Computed like the server does on saving (family/scope.ts), so buttons only
  // appear where a change will be accepted
  const editable = useMemo(() => (tree && scope ? scopeSets(tree, scope).editable : null), [tree, scope])
  const canEditPerson = useCallback((id: string) => canEdit && (!editable || editable.has(id)), [canEdit, editable])
  const value = useMemo(
    () => (tree && index ? { tree, index, familyName, treeId, canEdit, canEditPerson, scope, commit, saving } : null),
    [tree, index, familyName, treeId, canEdit, canEditPerson, scope, commit, saving],
  )

  if (status === 'scope gone') return <ScopeGone />
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
    <div className="page-backdrop grid h-dvh place-items-center" role="status" aria-live="polite">
      <div className="surface flex flex-col items-center gap-4 rounded-panel border border-frame/50 px-10 py-8 shadow-lifted">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary-tint border-t-primary motion-reduce:animate-none" />
        <p className="font-text text-lg text-ink-muted">{t.family.loading}</p>
      </div>
    </div>
  )
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="page-backdrop grid h-dvh place-items-center p-6">
      <div className="surface max-w-sm rounded-panel border border-frame/50 p-8 text-center shadow-lifted" role="alert">
        <p className="font-text text-xl text-ink">{t.family.loadFailed}</p>
        <p className="mt-2 text-ink-muted">{t.family.loadFailedHint}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-control bg-primary px-5 py-2.5 font-medium text-on-primary hover:bg-primary-hover"
        >
          {t.family.reload}
        </button>
      </div>
    </div>
  )
}

function ScopeGone() {
  const { t } = useI18n()
  return (
    <div className="page-backdrop grid h-dvh place-items-center p-6">
      <div className="surface max-w-sm rounded-panel border border-frame/50 p-8 text-center shadow-lifted" role="alert">
        <p className="font-text text-xl text-ink">{t.family.scopeGone}</p>
        <p className="mt-2 text-ink-muted">{t.family.scopeGoneHint}</p>
        <Link
          href="/?pick=1"
          className="mt-6 inline-block rounded-control bg-primary px-5 py-2.5 font-medium text-on-primary hover:bg-primary-hover"
        >
          {t.nav.myTrees}
        </Link>
      </div>
    </div>
  )
}

function ConflictBanner({ onReload }: { onReload: () => void }) {
  const { t } = useI18n()
  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-card bg-accent-soft px-4 py-3 text-sm text-accent-deep shadow-lifted"
    >
      <span className="flex-1">{t.family.conflict}</span>
      <button
        type="button"
        onClick={onReload}
        className="rounded-control bg-accent-deep px-3 py-1.5 font-medium text-on-primary"
      >
        {t.family.loadLatest}
      </button>
    </div>
  )
}
