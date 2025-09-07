// src/components/FamilyTreeProvider.tsx
'use client'

import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FamilyTree } from '@/models/FamilyTree'
import { IMember } from '@/types/IMember'
import { buildTreeFromStored } from '@/storage/rebuild'
import { StoredTree, serializeFromRoot } from '@/storage/schema'
import { setupShanFamilyTree } from '@/utils'

interface Ctx {
  root: IMember
  familyTree: FamilyTree
  setFamilyTree: (tree: FamilyTree) => void

  /** Markiere, dass der Tree **mutiert** wurde (erzwingt Re-Render + optional Debounce-Save) */
  markDirty: () => void

  /** Sofort persistieren (ein PUT). Wartet bis abgeschlossen. */
  saveNow: () => Promise<void>

  /** Optional: key um Graph/Canvas hart zu remounten (z. B. <Graph key={layoutNonce} />) */
  layoutNonce: number

  memberNames?: string[]
  isLoaded: boolean
  error?: string | null
  isAuthed: boolean
  applyStored: (stored: StoredTree) => void
  storedSnapshot?: StoredTree
  membersById: Record<string, IMember>
  getById: (id: string) => IMember | null
}

const FamilyTreeContext = createContext({} as Ctx)

/** Schöne, leichte Loading-Animation (zugänglich, ohne Extra-Deps) */
function LoadingScreen() {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-[color:var(--color-surface-50)]">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        {/* Spinner */}
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-4 border-[color:var(--color-primary-100)] border-t-[color:var(--color-primary)] animate-spin motion-reduce:animate-none" />
          {/* zarter Glanz */}
          <div className="pointer-events-none absolute inset-0 rounded-full blur-md opacity-30" style={{
            background: 'conic-gradient(var(--color-primary) 0turn, transparent 0.25turn)'
          }} />
        </div>

        {/* Text + „pulsende“ Punkte */}
        <div className="text-sm text-[color:var(--color-primary-800)] font-medium">
          Stammbaum wird geladen<span className="inline-flex w-6">
            <span className="animate-pulse">.</span>
            <span className="animate-pulse [animation-delay:150ms]">.</span>
            <span className="animate-pulse [animation-delay:300ms]">.</span>
          </span>
        </div>

        {/* Subtext */}
        <div className="text-xs text-[color:var(--color-primary-600)]">
          Bitte einen Moment Geduld
        </div>
        <span className="sr-only">Inhalt wird geladen…</span>
      </div>
    </div>
  )
}

export const FamilyTreeProvider = ({ children }: { children: ReactNode }) => {
  const [familyTree, setFamilyTree] = useState<FamilyTree | null>(null)
  const [storedSnapshot, setStoredSnapshot] = useState<StoredTree | null>(null)
  const [membersById, setMembersById] = useState<Record<string, IMember>>({})
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean>(true)

  // für harten Remount von graphischen Komponenten
  const [layoutNonce, setLayoutNonce] = useState(0)

  // Steuerung
  const loadReqIdRef = useRef(0)
  const mutateEpochRef = useRef(0)
  const persistIdRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)

  // Resolver für saveNow()
  const pendingPersistResolversRef = useRef<Array<() => void>>([])

  const rebuildFromStored = (stored: StoredTree) => {
    const rebuilt = buildTreeFromStored(stored)
    const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
    ft.root = rebuilt.root

    setFamilyTree(ft)
    setMembersById(rebuilt.byId)
    setStoredSnapshot(stored)
    setLayoutNonce((n) => n + 1)
  }

  const applyStored = (stored: StoredTree) => {
    mutateEpochRef.current += 1
    rebuildFromStored(stored)
  }

  // Initial load
  useEffect(() => {
    const myReqId = ++loadReqIdRef.current
    let aborted = false

    ;(async () => {
      try {
        const res = await fetch('/api/family', { cache: 'no-store' })
        if (aborted || myReqId !== loadReqIdRef.current) return

        if (res.status === 401) {
          setIsAuthed(false)
          setError('UNAUTHORIZED')
          setIsLoaded(true)
          return
        }
        if (!res.ok) throw new Error(`GET /api/family ${res.status}`)

        const data = (await res.json()) as StoredTree
        if (mutateEpochRef.current > 0) {
          setIsLoaded(true)
          return
        }
        rebuildFromStored(data)
        setIsAuthed(true)
        setIsLoaded(true)
      } catch {
        const seed = setupShanFamilyTree()
        const snap = serializeFromRoot(seed.root)
        rebuildFromStored(snap)
        setIsLoaded(true)
        setError('Server storage unavailable; using in-memory seed.')
      }
    })()

    return () => { aborted = true }
  }, [])

  // Debounced persist, immer wenn familyTree-Referenz wechselt (durch markDirty)
  useEffect(() => {
    if (!familyTree || error === 'UNAUTHORIZED') return

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const myPersistId = ++persistIdRef.current
    const t = window.setTimeout(async () => {
      const payload = serializeFromRoot(
        familyTree.root,
        storedSnapshot ?? undefined
      )
      try {
        await fetch('/api/family', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setStoredSnapshot(payload)
      } finally {
        const resolvers = pendingPersistResolversRef.current
        pendingPersistResolversRef.current = []
        resolvers.forEach((r) => r())
      }
    }, 400) // großzügigeres Debounce

    debounceTimerRef.current = t
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyTree])

  /** von außen aufrufen, nachdem du AM OBJEKT mutiert hast */
  const markDirty = () => {
    if (!familyTree) return
    mutateEpochRef.current += 1

    // WICHTIG: komplette Struktur neu aufbauen, damit alle Referenzen wechseln
    const snap = serializeFromRoot(familyTree.root, storedSnapshot ?? undefined)
    const rebuilt = buildTreeFromStored(snap)
    const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
    ft.root = rebuilt.root

    // NICHT storedSnapshot setzen (das passiert erst nach saveNow)
    setFamilyTree(ft)
    setMembersById(rebuilt.byId)
    setLayoutNonce((n) => n + 1)
  }

  /** sofort persistieren (ein PUT) und auf Abschluss warten */
  const saveNow = async () => {
    return new Promise<void>((resolve) => {
      if (!familyTree) {
        resolve()
        return
      }
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      pendingPersistResolversRef.current.push(resolve)

      const payload = serializeFromRoot(
        familyTree.root,
        storedSnapshot ?? undefined
      )
      fetch('/api/family', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(() => setStoredSnapshot(payload))
        .finally(() => {
          const resolvers = pendingPersistResolversRef.current
          pendingPersistResolversRef.current = []
          resolvers.forEach((r) => r())
        })
    })
  }

  const getById = (id: string) => membersById[id] ?? null

  const value = useMemo(
    () => ({
      familyTree: familyTree!,
      setFamilyTree,
      root: familyTree?.root as IMember,
      memberNames: familyTree?.getMemberNames?.(),
      isLoaded,
      error,
      isAuthed,
      applyStored,
      storedSnapshot: storedSnapshot ?? undefined,
      membersById,
      getById,
      markDirty,
      saveNow,
      layoutNonce,
    }),
    [
      familyTree,
      isLoaded,
      error,
      isAuthed,
      storedSnapshot,
      membersById,
      layoutNonce,
    ]
  )

  if (!isLoaded) return <LoadingScreen />
  if (!familyTree && isAuthed) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-sm text-[color:var(--color-primary-700)]">
          Kein Stammbaum geladen.
        </div>
      </div>
    )
  }

  return (
    <FamilyTreeContext.Provider value={value}>
      {children}
    </FamilyTreeContext.Provider>
  )
}

export const useFamilyTree = () => useContext(FamilyTreeContext)
