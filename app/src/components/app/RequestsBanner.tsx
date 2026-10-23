// src/components/app/RequestsBanner.tsx
// Under the top bar: "that's me" claims this member may confirm (as a moderator or a
// close relative), and for moderators a pointer to open access requests.

import Link from 'next/link'
import { UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nProvider'
import { useFamily } from './FamilyProvider'
import { useRequests } from './RequestsProvider'

export function RequestsBanner() {
  const { treeId, canManage } = useFamily()
  const { claims, access, decideClaim } = useRequests()
  const { t } = useI18n()
  const r = t.requests
  if (!claims.length && !(canManage && access.length)) return null
  return (
    <div className="flex flex-col gap-1.5 border-b border-frame/60 bg-accent-soft py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-[15px] text-ink">
      {claims.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <UserCheck className="h-4 w-4 shrink-0 text-accent-deep" />
          {/* Wide enough to read; on phones the buttons move below */}
          <span className="min-w-0 flex-[1_1_14rem]">{r.claimToConfirm(c.userName, c.personName)}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => decideClaim(c.id, true)}>
              {r.confirm}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => decideClaim(c.id, false)}>
              {r.reject}
            </Button>
          </span>
        </div>
      ))}
      {canManage && access.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3">
          <UserCheck className="h-4 w-4 shrink-0 text-accent-deep" />
          <span className="min-w-0 flex-1">{r.accessWaiting(access.length)}</span>
          <Link href={`/tree/${treeId}/members`} className="font-semibold text-accent-deep underline">
            {r.toMembers}
          </Link>
        </div>
      )}
    </div>
  )
}
