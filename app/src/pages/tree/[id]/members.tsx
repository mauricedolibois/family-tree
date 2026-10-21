// Members of one tree: invite people, change roles and the part of the tree a member
// gets, remove members. For the tree's moderators; for everyone else the page does
// not exist.

import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import clsx from 'clsx'
import { Plus, SlidersHorizontal, UserMinus } from 'lucide-react'
import type { Role, TreeMember } from '@/lib/accounts'
import { canManage, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { navContext, requirePageUser } from '@/lib/pageAuth'
import { Button } from '@/components/ui/Button'
import { FormMessage, postJson } from '@/components/auth/AuthLayout'
import { PageHeader } from '@/components/app/PageHeader'
import type { NavContext } from '@/components/app/NavMenu'
import { Badge, Card, LinkBox, RoleSelect, selectClass } from '@/components/manage/parts'
import { ScopeEditor, scopeForRole, scopeReady } from '@/components/manage/ScopeEditor'
import type { Tree } from '@/family/model'
import type { TreeScope } from '@/family/scope'
import { useI18n } from '@/i18n/I18nProvider'
import { INTL_TAG, type Locale } from '@/i18n/locales'
import { localeFromRequest } from '@/i18n/server'

type Props = { treeId: string; nav: NavContext; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const auth = await requirePageUser(ctx)
  if (auth.redirect) return { redirect: auth.redirect }
  const treeId = treeIdParam(ctx.params?.id)
  const access = treeId ? await treeAccess(auth.user, treeId) : null
  if (!treeId || !access) return { redirect: { destination: '/?gone=1', permanent: false } }
  if (!canManage(access)) return { redirect: { destination: `/tree/${treeId}`, permanent: false } }
  return {
    props: { treeId, nav: await navContext(auth.user, { id: treeId, access }), locale: localeFromRequest(ctx.req) },
  }
}

type Invite = {
  id: string
  email: string | null
  role: Role
  scope: TreeScope | null
  inviter: string | null
  expiresAt: string
}
type Overview = {
  tree: { id: string; name: string }
  me: string
  mail: boolean
  members: TreeMember[]
  invites: Invite[]
}

export default function MembersPage({ treeId, nav }: Props) {
  const { t, locale } = useI18n()
  const [data, setData] = useState<Overview | null>(null)
  // The tree itself, to choose the part a member gets
  const [tree, setTree] = useState<Tree | null>(null)
  const [editing, setEditing] = useState<{ id: string; scope: TreeScope | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const api = `/api/trees/${treeId}`
  const date = (iso: string) => new Date(iso).toLocaleDateString(INTL_TAG[locale], { dateStyle: 'medium' })
  const statusText = (code: unknown) => t.members.status[String(code)] ?? t.common.retry

  const load = useCallback(async () => {
    const res = await fetch(`${api}/members`, { cache: 'no-store' })
    if (res.ok) setData((await res.json()) as Overview)
    else setError(t.common.retry)
  }, [api, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    fetch(api, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Tree>) : null))
      .then(setTree)
      .catch(() => setTree(null))
  }, [api])

  /** The part in words, for the member list */
  const scopeText = (scope: TreeScope | null, role: Role) => {
    if (!scope) return null
    const name = tree?.members[scope.person]?.name
    if (tree && !name) return t.members.access.gone
    return t.members.access.summary(name ?? '…', scope.hideRest, role === 'editor')
  }

  /** Runs a change, reloads the overview and shows what went wrong */
  const run = async (path: string, body: object | null, method: string) => {
    setError(null)
    const { ok, data: d } = await postJson(`${api}${path}`, body, method)
    if (!ok) setError(statusText(d.error))
    await load()
  }

  return (
    <>
      <Head>
        <title>{data ? `${t.members.title} – ${data.tree.name}` : t.members.title}</title>
      </Head>
      <div className="page-backdrop min-h-dvh">
        <PageHeader title={t.members.title} nav={nav} current="members" />

        <main className="mx-auto flex max-w-3xl flex-col gap-5 p-3 sm:p-5">
          {error && <FormMessage>{error}</FormMessage>}
          {!data ? (
            <p className="text-center text-ink-muted">{t.auth.wait}</p>
          ) : (
            <>
              <p className="text-[15px] text-ink">{t.members.intro(data.tree.name)}</p>
              {!data.mail && <FormMessage tone="info">{t.admin.noMail}</FormMessage>}
              <InviteForm api={api} tree={tree} mail={data.mail} statusText={statusText} onCreated={load} />
              <Card title={t.admin.openInvites}>
                {data.invites.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t.admin.noInvites}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-card-rule">
                    {data.invites.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span className="min-w-0 flex-1 text-[15px] text-ink">
                          {i.email ?? t.admin.anyone} · {t.roles[i.role]}
                          {i.scope && (
                            <span className="block text-[13px] text-ink-muted">{scopeText(i.scope, i.role)}</span>
                          )}
                          <span className="block text-[13px] text-ink-muted">
                            {t.admin.inviteMeta(i.inviter ?? '–', date(i.expiresAt))}
                          </span>
                        </span>
                        <Button size="sm" variant="quiet" onClick={() => run(`/invites/${i.id}`, null, 'DELETE')}>
                          {t.admin.revoke}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title={t.members.title}>
                {data.members.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t.members.noMembers}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-card-rule">
                    {data.members.map((m) => {
                      const self = m.id === data.me
                      const edit = editing?.id === m.id ? editing : null
                      return (
                        <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 text-[15px] text-ink">
                              {m.name}
                              {self && <Badge>{t.admin.you}</Badge>}
                              {m.isAdmin && <Badge>{t.roles.admin}</Badge>}
                              {!m.verified && <Badge>{t.admin.unverified}</Badge>}
                              {m.disabled && <Badge>{t.admin.disabled}</Badge>}
                            </span>
                            <span className="block truncate text-[13px] text-ink-muted">{m.email}</span>
                            {m.scope && (
                              <span className="block text-[13px] text-ink-muted">{scopeText(m.scope, m.role)}</span>
                            )}
                          </span>
                          {m.role !== 'moderator' && (
                            <button
                              type="button"
                              disabled={self}
                              aria-label={t.members.access.edit}
                              title={t.members.access.edit}
                              aria-expanded={!!edit}
                              onClick={() => setEditing(edit ? null : { id: m.id, scope: m.scope })}
                              className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              <SlidersHorizontal className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                          <RoleSelect
                            className={clsx(selectClass, 'w-40')}
                            value={m.role}
                            label={t.admin.role}
                            disabled={self}
                            onChange={(role) => run(`/members/${m.id}`, { role }, 'PUT')}
                          />
                          <button
                            type="button"
                            disabled={self}
                            aria-label={t.members.remove}
                            title={t.members.remove}
                            onClick={() =>
                              window.confirm(t.members.confirmRemove(m.name, data.tree.name)) &&
                              run(`/members/${m.id}`, null, 'DELETE')
                            }
                            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                          >
                            <UserMinus className="h-4 w-4" aria-hidden />
                          </button>
                          {edit && (
                            <div className="flex w-full flex-col gap-3 rounded-control border border-card-rule p-3">
                              <ScopeEditor
                                tree={tree}
                                role={m.role}
                                value={edit.scope}
                                onChange={(scope) => setEditing({ id: m.id, scope })}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={!scopeReady(edit.scope)}
                                  onClick={async () => {
                                    setEditing(null)
                                    await run(
                                      `/members/${m.id}`,
                                      { role: m.role, scope: scopeForRole(edit.scope, m.role) },
                                      'PUT',
                                    )
                                  }}
                                >
                                  {t.members.access.save}
                                </Button>
                                <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
                                  {t.members.access.cancel}
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </>
          )}
        </main>
      </div>
    </>
  )
}

function InviteForm({
  api,
  tree,
  mail,
  statusText,
  onCreated,
}: {
  api: string
  tree: Tree | null
  mail: boolean
  statusText: (code: unknown) => string
  onCreated: () => void
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [scope, setScope] = useState<TreeScope | null>(null)
  const [days, setDays] = useState(7)
  const [result, setResult] = useState<{ path: string; mailed: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    const { ok, data } = await postJson(`${api}/invites`, { email, role, scope: scopeForRole(scope, role), days })
    if (!ok) return setError(statusText(data.error))
    setResult({ path: String(data.path), mailed: !!data.mailed })
    setEmail('')
    onCreated()
  }

  return (
    <Card title={t.admin.inviteTitle}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="field-label">{t.admin.inviteEmail}</span>
          <input
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.admin.optional}
          />
          <span className="text-sm text-ink-faint">{mail ? t.admin.inviteEmailHintMail : t.admin.inviteEmailHint}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">{t.admin.role}</span>
          <RoleSelect value={role} onChange={setRole} />
        </label>
        <label className="flex items-center gap-2 self-end text-[15px] text-ink">
          {t.admin.validFor}
          <input
            type="number"
            min={1}
            max={30}
            className="field h-9 w-20 py-0 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
          {t.admin.days}
        </label>
        <p className="text-sm text-ink-muted sm:col-span-2">{t.members.rolesHelp}</p>
        {role !== 'moderator' && (
          <div className="sm:col-span-2">
            <ScopeEditor tree={tree} role={role} value={scope} onChange={setScope} />
          </div>
        )}
        {error && (
          <div className="sm:col-span-2">
            <FormMessage>{error}</FormMessage>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            disabled={role !== 'moderator' && !scopeReady(scope)}
          >
            {t.admin.createInvite}
          </Button>
        </div>
      </form>
      {result && <LinkBox path={result.path} note={result.mailed ? t.admin.inviteMailed : t.admin.inviteCopy} />}
    </Card>
  )
}
