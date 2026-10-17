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
import { TREE_VERSION_HEADER } from '@/storage/version'

/** Der Baum wurde inzwischen woanders gespeichert (anderes Gerät oder Tab). */
export class TreeConflictError extends Error {
  constructor() {
    super('Der Stammbaum wurde inzwischen woanders geändert.')
  }
}

interface Ctx {
  root: IMember
  familyTree: FamilyTree
  setFamilyTree: (tree: FamilyTree) => void

  /** Markiere, dass der Tree **mutiert** wurde (erzwingt Re-Render) */
  markDirty: () => void

  /** Sofort persistieren (genau ein PUT). */
  saveNow: () => Promise<void>

  /** Gegebenen Stand speichern und bei Erfolg anzeigen. Wirft bei Fehler/Konflikt. */
  commit: (stored: StoredTree) => Promise<void>

  /** Key um Graph/Canvas hart zu remounten (z. B. <Graph key={layoutNonce} />) */
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

/** kleines, zugängliches Loading */
function LoadingScreen() {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-[color:var(--color-surface-50)]">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-4 border-[color:var(--color-primary-100)] border-t-[color:var(--color-primary)] animate-spin motion-reduce:animate-none" />
          <div
            className="pointer-events-none absolute inset-0 rounded-full blur-md opacity-30"
            style={{ background: 'conic-gradient(var(--color-primary) 0turn, transparent 0.25turn)' }}
          />
        </div>
        <div className="text-sm text-[color:var(--color-primary-800)] font-medium">
          Stammbaum wird geladen<span className="inline-flex w-6">
            <span className="animate-pulse">.</span>
            <span className="animate-pulse [animation-delay:150ms]">.</span>
            <span className="animate-pulse [animation-delay:300ms]">.</span>
          </span>
        </div>
        <div className="text-xs text-[color:var(--color-primary-600)]">Bitte einen Moment Geduld</div>
        <span className="sr-only">Inhalt wird geladen…</span>
      </div>
    </div>
  )
}

function LoadErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-[color:var(--color-surface-50)] p-6">
      <div className="max-w-sm text-center flex flex-col items-center gap-3" role="alert">
        <p className="text-base font-medium text-[color:var(--color-primary-800)]">
          Der Stammbaum konnte nicht geladen werden.
        </p>
        <p className="text-sm text-[color:var(--color-primary-600)]">
          Deine Daten sind sicher. Bitte prüfe die Verbindung und versuche es erneut.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full px-5 py-2 bg-[color:var(--color-primary)] text-white font-medium"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  )
}

function ConflictBanner() {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-3 text-sm text-amber-900 shadow"
    >
      <span>Der Stammbaum wurde inzwischen woanders geändert. Deine letzte Änderung wurde nicht gespeichert.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-amber-900 px-4 py-1 font-medium text-white"
      >
        Neu laden
      </button>
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
  /** Version des zuletzt geladenen/gespeicherten Serverstands */
  const versionRef = useRef<string | null>(null)
  const [hasConflict, setHasConflict] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // für harten Remount z. B. Graph
  const [layoutNonce, setLayoutNonce] = useState(0)

  // Steuerung
  const loadReqIdRef = useRef(0)
  /** erhöht sich nur bei echten lokalen Mutationen; hilft GET-Race zu ignorieren */
  const mutateEpochRef = useRef(0)

  /** wurde seit letztem Persist lokal geändert? — rein informativ */
  const [isDirty, setIsDirty] = useState(false)

  const rebuildFromStored = (stored: StoredTree) => {
    const rebuilt = buildTreeFromStored(stored)
    const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
    ft.root = rebuilt.root

    setFamilyTree(ft)
    setMembersById(rebuilt.byId)
    setStoredSnapshot(stored)
    setLayoutNonce((n) => n + 1)
  }

  /** Nur Serverstand anwenden. Markiert **nicht** als mutiert. */
  const applyStored = (stored: StoredTree) => {
    rebuildFromStored(stored)
  }

  // Initial load (read-only). Bei Fehlern wird NIE ein Ersatzbaum angezeigt –
  // sonst könnte eine Änderung daran den echten Baum überschreiben.
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
        versionRef.current = res.headers.get(TREE_VERSION_HEADER)

        // Wurde lokal schon mutiert, während das GET in-flight war? Dann GET ignorieren.
        if (mutateEpochRef.current > 0) {
          setIsLoaded(true)
          return
        }

        rebuildFromStored(data)
        setIsAuthed(true)
        setError(null)
        setIsLoaded(true)
      } catch (e) {
        if (aborted) return
        console.error('[FamilyTreeProvider] load failed', e)
        setError('LOAD_FAILED')
        setIsLoaded(true)
      }
    })()

    return () => {
      aborted = true
    }
  }, [loadAttempt])

  /** Nach lokaler MUTATION am Objekt aufrufen; baut Struktur neu und markiert dirty */
  const markDirty = () => {
    if (!familyTree) return
    mutateEpochRef.current += 1
    setIsDirty(true)

    // komplette Struktur neu aufbauen (neue Referenzen -> UI/Graph sicher neu)
    const snap = serializeFromRoot(familyTree.root, storedSnapshot ?? undefined)
    const rebuilt = buildTreeFromStored(snap)
    const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
    ft.root = rebuilt.root

    // storedSnapshot bleibt der zuletzt gespeicherte Serverstand
    setFamilyTree(ft)
    setMembersById(rebuilt.byId)
    setLayoutNonce((n) => n + 1)
  }

  /** Speichert genau diesen Stand (ein PUT) und zeigt ihn bei Erfolg an. */
  const commit = async (stored: StoredTree) => {
    if (!isAuthed) throw new Error('Nicht angemeldet')
    const res = await fetch('/api/family', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(versionRef.current ? { [TREE_VERSION_HEADER]: versionRef.current } : {}),
      },
      body: JSON.stringify(stored),
    })
    if (res.status === 409) {
      setHasConflict(true)
      throw new TreeConflictError()
    }
    if (!res.ok) throw new Error(`PUT /api/family ${res.status}`)

    versionRef.current = res.headers.get(TREE_VERSION_HEADER)
    setIsDirty(false)
    rebuildFromStored(stored)
  }

  /** Persistiert JETZT den aktuellen Stand im Speicher (genau ein PUT). */
  const saveNow = async () => {
    if (!familyTree) return
    await commit(serializeFromRoot(familyTree.root, storedSnapshot ?? undefined))
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
      commit,
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
  if (error === 'LOAD_FAILED') {
    return (
      <LoadErrorScreen
        onRetry={() => {
          setIsLoaded(false)
          setError(null)
          setLoadAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!familyTree && isAuthed) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-sm text-[color:var(--color-primary-700)]">Kein Stammbaum geladen.</div>
      </div>
    )
  }

  return (
    <FamilyTreeContext.Provider value={value}>
      {hasConflict && <ConflictBanner />}
      {children}
    </FamilyTreeContext.Provider>
  )
}

export const useFamilyTree = () => useContext(FamilyTreeContext)
