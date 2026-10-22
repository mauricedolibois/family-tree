// Members of one tree: invite people, change roles and the part of the tree a member
// gets, remove members. For the tree's moderators; for everyone else the page does
// not exist.

import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import type { GetServerSideProps } from 'next'
import clsx from 'clsx'
import { Eye, GitBranch, Plus, SlidersHorizontal, UserMinus, UserRound, X } from 'lucide-react'
import type { Role, TreeMember } from '@/lib/accounts'
import { canManage, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { navContext, requirePageUser } from '@/lib/pageAuth'
import { Button } from '@/components/ui/Button'
import { FormMessage, postJson } from '@/components/auth/AuthLayout'
import { PageHeader } from '@/components/app/PageHeader'
import type { NavContext } from '@/components/app/NavMenu'
import { Badge, Card, LinkBox, RoleSelect, selectClass } from '@/components/manage/parts'
import { newScope, PersonSearch, ScopeEditor, scopeForRole, scopeReady } from '@/components/manage/ScopeEditor'
import { lifeYears } from '@/family/format'
import type { Tree } from '@/family/model'
import { describeScope, startOf, withLine, type BloodLine, type TreeScope } from '@/family/scope'
import { ScopeChanges } from '@/components/manage/ScopePreview'
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
  personId: string | null
  inviter: string | null
  expiresAt: string
}
type Requests = {
  claims: Array<{ id: string; userName: string; personName: string }>
  access: Array<{ id: string; userId: string; userName: string; line: BloodLine; personName: string }>
}

type Overview = {
  tree: { id: string; name: string }
  me: string
  meIsAdmin: boolean
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
  const [requests, setRequests] = useState<Requests>({ claims: [], access: [] })
  const api = `/api/trees/${treeId}`
  const date = (iso: string) => new Date(iso).toLocaleDateString(INTL_TAG[locale], { dateStyle: 'medium' })
  const statusText = (code: unknown) => t.members.status[String(code)] ?? t.common.retry
  // Opened from a person's info sheet: what each member has of this person
  const router = useRouter()
  const focusId = typeof router.query.person === 'string' ? router.query.person : null
  const focus = focusId ? tree?.members[focusId] ?? null : null

  const load = useCallback(async () => {
    const [res, req] = await Promise.all([
      fetch(`${api}/members`, { cache: 'no-store' }),
      fetch(`${api}/requests`, { cache: 'no-store' }),
    ])
    if (res.ok) setData((await res.json()) as Overview)
    else setError(t.common.retry)
    if (req.ok) setRequests((await req.json()) as Requests)
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
    if (tree && !tree.members[startOf(scope)]) return t.members.access.gone
    const names = scope.lines.map((l) => tree?.members[l.person]?.name ?? '…').join(', ')
    return t.members.access.summary(names, scope.hideRest, role === 'editor')
  }

  /** "Karl Berger (* 1935)", for who someone is in the tree */
  const personLabel = (id: string | null) => {
    const p = id ? tree?.members[id] : null
    return p ? [p.name, lifeYears(p) && `(${lifeYears(p)})`].filter(Boolean).join(' ') : null
  }
  // People someone is linked to or invited as already: not offered a second time
  const taken = new Set(
    [...(data?.members ?? []).map((m) => m.personId), ...(data?.invites ?? []).map((i) => i.personId)].filter(
      (id): id is string => !!id,
    ),
  )

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
        <PageHeader title={t.admin.title} nav={nav} current="members" />

        <main className="mx-auto flex max-w-3xl flex-col gap-5 p-3 sm:p-5">
          {error && <FormMessage>{error}</FormMessage>}
          {!data ? (
            <p className="text-center text-ink-muted">{t.auth.wait}</p>
          ) : (
            <>
              <p className="text-[15px] text-ink">{t.members.intro(data.tree.name)}</p>
              {!data.mail && <FormMessage tone="info">{t.admin.noMail}</FormMessage>}
              {focus && tree && (
                <Card title={t.members.forPerson.title(focus.name)}>
                  <p className="mb-2 text-sm text-ink-muted">{t.members.forPerson.hint}</p>
                  <ul className="flex flex-col divide-y divide-card-rule">
                    {data.members
                      .filter((m) => m.id !== data.me)
                      .map((m) => {
                        const entry = m.scope ? describeScope(tree, m.scope).get(focus.id) : null
                        const status = !m.scope
                          ? t.members.preview.status.editable
                          : entry?.detailsOnly
                          ? t.members.preview.detailsOnly
                          : t.members.preview.status[entry?.status ?? 'hidden']
                        return (
                          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                            <span className="min-w-0 flex-1 text-[15px] text-ink">
                              {m.name}
                              <span className="block text-[13px] text-ink-muted">
                                {m.role === 'viewer' && m.scope ? t.roles.viewer : status}
                              </span>
                            </span>
                            {m.scope && (entry?.status !== 'editable' || entry.detailsOnly) && (
                              <Button
                                size="sm"
                                icon={<GitBranch className="h-4 w-4" />}
                                onClick={() => {
                                  setEditing({ id: m.id, scope: withLine(m.scope!, focus.id) })
                                  // The editor opens in the member list further down
                                  setTimeout(
                                    () =>
                                      document
                                        .getElementById(`member-${m.id}`)
                                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                    50,
                                  )
                                }}
                              >
                                {t.members.preview.addLineOf(focus.name)}
                              </Button>
                            )}
                          </li>
                        )
                      })}
                  </ul>
                </Card>
              )}
              {(requests.claims.length > 0 || requests.access.length > 0) && (
                <Card title={t.requests.title}>
                  <ul className="flex flex-col divide-y divide-card-rule">
                    {requests.claims.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span className="min-w-0 flex-1 text-[15px] text-ink">
                          {t.requests.claimRow(c.userName, c.personName)}
                        </span>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => run(`/requests/${c.id}`, { kind: 'claim', approve: true }, 'PUT')}
                        >
                          {t.requests.confirm}
                        </Button>
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => run(`/requests/${c.id}`, { kind: 'claim', approve: false }, 'PUT')}
                        >
                          {t.requests.reject}
                        </Button>
                      </li>
                    ))}
                    {requests.access.map((a) => {
                      const member = data.members.find((m) => m.id === a.userId)
                      return (
                        <li key={a.id} className="flex flex-col gap-2 py-2">
                          <span className="text-[15px] text-ink">{t.requests.accessRow(a.userName, a.personName)}</span>
                          {tree && member?.scope && (
                            <ScopeChanges tree={tree} before={member.scope} after={withLine(member.scope, a.line)} />
                          )}
                          <span className="flex gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => run(`/requests/${a.id}`, { kind: 'access', approve: true }, 'PUT')}
                            >
                              {t.requests.confirm}
                            </Button>
                            <Button
                              size="sm"
                              variant="quiet"
                              onClick={() => run(`/requests/${a.id}`, { kind: 'access', approve: false }, 'PUT')}
                            >
                              {t.requests.reject}
                            </Button>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )}
              <InviteForm
                key={focusId ?? ''}
                api={api}
                tree={tree}
                mail={data.mail}
                canGrantAdmin={data.meIsAdmin}
                taken={taken}
                person={focusId && !taken.has(focusId) ? focusId : null}
                statusText={statusText}
                onCreated={load}
              />
              <Card title={t.admin.openInvites}>
                {data.invites.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t.admin.noInvites}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-card-rule">
                    {data.invites.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span className="min-w-0 flex-1 text-[15px] text-ink">
                          {personLabel(i.personId) ?? i.email ?? t.admin.anyone} · {t.roles[i.role]}
                          {i.personId && i.email && <span className="block text-[13px] text-ink-muted">{i.email}</span>}
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
                        <li
                          key={m.id}
                          id={`member-${m.id}`}
                          className="flex scroll-mt-4 flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
                        >
                          {/* On phones the details get the whole width and the controls a row below */}
                          <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 text-[15px] text-ink">
                              {m.name}
                              {self && <Badge>{t.admin.you}</Badge>}
                              {m.isAdmin && <Badge>{t.roles.admin}</Badge>}
                              {!m.verified && <Badge>{t.admin.unverified}</Badge>}
                              {m.disabled && <Badge>{t.admin.disabled}</Badge>}
                            </span>
                            <span className="block truncate text-[13px] text-ink-muted">{m.email}</span>
                            <MemberPerson
                              tree={tree}
                              label={personLabel(m.personId)}
                              exclude={taken}
                              disabled={self && !data.meIsAdmin}
                              onLink={(personId) => run(`/members/${m.id}`, { personId }, 'PUT')}
                            />
                            {m.scope && (
                              <span className="block text-[13px] text-ink-muted">{scopeText(m.scope, m.role)}</span>
                            )}
                          </span>
                          <span className="flex w-full items-center gap-1 sm:w-auto">
                            {m.role !== 'moderator' && !self && (
                              <Link
                                href={`/tree/${treeId}?as=${encodeURIComponent(m.id)}`}
                                aria-label={t.members.viewAs(m.name)}
                                title={t.members.viewAs(m.name)}
                                className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
                              >
                                <Eye className="h-4 w-4" aria-hidden />
                              </Link>
                            )}
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
                              className={clsx(selectClass, 'min-w-0 flex-1 sm:w-40 sm:flex-none')}
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
                          </span>
                          {edit && (
                            <div className="flex w-full flex-col gap-3 rounded-control border border-card-rule p-3">
                              <ScopeEditor
                                tree={tree}
                                role={m.role}
                                value={edit.scope}
                                before={m.scope}
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

/** Who a member is in the tree: shown, changed or unlinked by the moderator */
function MemberPerson({
  tree,
  label,
  exclude,
  disabled,
  onLink,
}: {
  tree: Tree | null
  label: string | null
  exclude: Set<string>
  disabled: boolean
  onLink: (personId: string | null) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <span className="mt-1 block">
        <PersonSearch
          tree={tree}
          kind="person"
          label={t.members.person.choose}
          exclude={exclude}
          onPick={(id) => {
            setOpen(false)
            onLink(id)
          }}
        />
      </span>
    )
  }
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]">
      <UserRound className="h-3.5 w-3.5 text-ink-muted" />
      {label ? (
        <span className="text-ink">{label}</span>
      ) : (
        <span className="text-ink-muted">{t.members.person.none}</span>
      )}
      {!disabled && (
        <>
          <button type="button" onClick={() => setOpen(true)} className="text-accent-deep underline">
            {label ? t.members.person.change : t.members.person.link}
          </button>
          {label && (
            <button
              type="button"
              onClick={() => onLink(null)}
              aria-label={t.members.person.unlink}
              title={t.members.person.unlink}
              className="text-ink-muted hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </span>
  )
}

function InviteForm({
  api,
  tree,
  mail,
  canGrantAdmin,
  taken,
  person: initialPerson,
  statusText,
  onCreated,
}: {
  api: string
  tree: Tree | null
  mail: boolean
  /** Admins may also hand on admin rights */
  canGrantAdmin: boolean
  /** People someone is linked to or invited as already */
  taken: Set<string>
  /** Opened from a person's info sheet: invite as this person */
  person: string | null
  statusText: (code: unknown) => string
  onCreated: () => void
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  // Who the invited person is; their blood line is where the part starts
  const [personId, setPersonId] = useState<string | null>(initialPerson)
  const [scope, setScope] = useState<TreeScope | null>(() => (initialPerson ? newScope(initialPerson) : null))
  const person = personId ? tree?.members[personId] : null
  const pickPerson = (id: string | null) => {
    setPersonId(id)
    setScope(id ? newScope(id) : null)
  }
  const [admin, setAdmin] = useState(false)
  const [days, setDays] = useState(7)
  const [result, setResult] = useState<{ path: string; mailed: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    const { ok, data } = await postJson(`${api}/invites`, {
      email,
      role,
      scope: scopeForRole(scope, role),
      personId,
      admin,
      days,
    })
    if (!ok) return setError(statusText(data.error))
    setResult({ path: String(data.path), mailed: !!data.mailed })
    setEmail('')
    setAdmin(false)
    pickPerson(null)
    onCreated()
  }

  return (
    <Card title={t.admin.inviteTitle}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          {person ? (
            <>
              <span className="field-label">{t.members.person.who}</span>
              <span className="flex items-center gap-2 rounded-control border border-accent/60 bg-card px-3 py-2">
                <UserRound className="h-4 w-4 text-accent-deep" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                  {person.name}
                  {lifeYears(person) && <span className="font-normal text-ink-muted"> ({lifeYears(person)})</span>}
                </span>
                <button
                  type="button"
                  onClick={() => pickPerson(null)}
                  aria-label={t.members.person.change}
                  title={t.members.person.change}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </>
          ) : (
            <PersonSearch tree={tree} kind="person" label={t.members.person.who} exclude={taken} onPick={pickPerson} />
          )}
          <span className="text-sm text-ink-muted">{t.members.person.whoHint}</span>
        </div>
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
        {canGrantAdmin && (
          <label className="flex items-center gap-2 text-[15px] text-ink sm:col-span-2">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            {t.admin.makeAdmin}
          </label>
        )}
        <p className="text-sm text-ink-muted sm:col-span-2">{t.members.rolesHelp}</p>
        {role !== 'moderator' && (
          <div className="min-w-0 sm:col-span-2">
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
            disabled={!personId || (role !== 'moderator' && !scopeReady(scope))}
          >
            {t.admin.createInvite}
          </Button>
        </div>
      </form>
      {result && <LinkBox path={result.path} note={result.mailed ? t.admin.inviteMailed : t.admin.inviteCopy} />}
    </Card>
  )
}
