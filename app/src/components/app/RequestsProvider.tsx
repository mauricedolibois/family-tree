// src/components/app/RequestsProvider.tsx
// What a member asked for and what they may decide (api/trees/[id]/requests): the
// "that's me" claim, access to a locked person's line, and claims of close
// relatives to confirm. Not loaded while a moderator looks at the tree as a member.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BloodLine } from '@/family/scope'
import { postJson } from '@/components/auth/AuthLayout'
import { useFamily } from './FamilyProvider'

export type OpenClaim = { id: string; userId: string; userName: string; personId: string; personName: string }
export type OpenAccess = { id: string; userId: string; userName: string; line: BloodLine; personName: string }

type Overview = {
  mine: { claim: { personId: string } | null; access: { line: BloodLine } | null }
  claims: OpenClaim[]
  access: OpenAccess[]
}

type RequestsCtx = Overview & {
  /** Sends a claim or an access request; resolves to the server's answer */
  ask: (kind: 'claim' | 'access', personId: string) => Promise<{ ok: boolean; linked?: boolean; error?: string }>
  decideClaim: (id: string, approve: boolean) => Promise<boolean>
  reload: () => Promise<void>
}

const EMPTY: Overview = { mine: { claim: null, access: null }, claims: [], access: [] }
const Ctx = createContext<RequestsCtx | null>(null)

export function useRequests(): RequestsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRequests must be used inside RequestsProvider')
  return ctx
}

export function RequestsProvider({ children }: { children: ReactNode }) {
  const { treeId, previewAs } = useFamily()
  const [overview, setOverview] = useState<Overview>(EMPTY)
  const api = `/api/trees/${treeId}/requests`

  const reload = useCallback(async () => {
    if (previewAs) return
    const res = await fetch(api, { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setOverview((await res.json()) as Overview)
  }, [api, previewAs])

  useEffect(() => {
    void reload()
  }, [reload])

  const ask = useCallback(
    async (kind: 'claim' | 'access', personId: string) => {
      const { ok, data } = await postJson(api, { kind, personId })
      await reload()
      return { ok, linked: data.linked === true, error: typeof data.error === 'string' ? data.error : undefined }
    },
    [api, reload],
  )

  const decideClaim = useCallback(
    async (id: string, approve: boolean) => {
      const { ok } = await postJson(`${api}/${id}`, { kind: 'claim', approve }, 'PUT')
      await reload()
      return ok
    },
    [api, reload],
  )

  const value = useMemo(() => ({ ...overview, ask, decideClaim, reload }), [overview, ask, decideClaim, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
