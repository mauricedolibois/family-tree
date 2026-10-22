// Administration: trees and accounts, a tab of the management area. Admins only;
// for everyone else the page does not exist. People are invited on a tree's
// members tab, so they always get a person in the tree; ?tree= is the tree the
// admin came from.

import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import clsx from 'clsx'
import { ChevronRight, KeyRound, Plus, Trash2, Upload, UserMinus } from 'lucide-react'
import type { AdminUserView } from '@/lib/accounts'
import { treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { navContext, requirePageUser } from '@/lib/pageAuth'
import { Button } from '@/components/ui/Button'
import { FormMessage, postJson } from '@/components/auth/AuthLayout'
import { PageHeader } from '@/components/app/PageHeader'
import type { NavContext } from '@/components/app/NavMenu'
import { Badge, Card, LinkBox, RoleSelect, selectClass as select, sendForm } from '@/components/manage/parts'
import { useI18n } from '@/i18n/I18nProvider'
import { INTL_TAG, type Locale } from '@/i18n/locales'
import { localeFromRequest } from '@/i18n/server'

type Props = { nav: NavContext; locale: Locale; treeId: string | null }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const auth = await requirePageUser(ctx)
  if (auth.redirect) return { redirect: auth.redirect }
  if (!auth.user.is_admin) return { notFound: true }
  const treeId = treeIdParam(ctx.query.tree)
  const access = treeId ? await treeAccess(auth.user, treeId) : null
  const tree = treeId && access ? { id: treeId, access } : undefined
  return {
    props: { nav: await navContext(auth.user, tree), locale: localeFromRequest(ctx.req), treeId: tree?.id ?? null },
  }
}

type Role = 'viewer' | 'editor' | 'moderator'
type Tree = { id: string; name: string; created_at: string }
type DeletedTree = { id: string; name: string; deleted_at: string }
type Invite = {
  id: string
  email: string | null
  treeId: string | null
  tree: string | null
  role: Role | null
  admin: boolean
  inviter: string | null
  expiresAt: string
}
type Overview = {
  me: string
  mail: boolean
  /** Set when supabase/setup.sql has to be run */
  schema: { have: number; need: number } | null
  users: AdminUserView[]
  trees: Tree[]
  trash: DeletedTree[]
  invites: Invite[]
}

export default function AdminPage({ nav, treeId }: Props) {
  const { t, locale } = useI18n()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const date = (iso: string) => new Date(iso).toLocaleDateString(INTL_TAG[locale], { dateStyle: 'medium' })

  const load = useCallback(async () => {
    const res = await fetch('/api/admin', { cache: 'no-store' })
    if (res.ok) setData((await res.json()) as Overview)
    else setError(t.common.retry)
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  /** Runs an admin request, reloads the overview and returns the response */
  const run = async (url: string, body: object | null, method: string) => {
    setError(null)
    const res = await postJson(url, body ?? {}, method)
    if (!res.ok) setError(t.admin.status[String(res.data.error ?? res.status)] ?? t.common.retry)
    await load()
    return res
  }

  return (
    <>
      <Head>
        <title>{t.admin.title}</title>
      </Head>
      <div className="page-backdrop min-h-dvh">
        <PageHeader title={t.admin.title} nav={nav} current="admin" />

        <main className="mx-auto flex max-w-4xl flex-col gap-5 p-3 sm:p-5">
          {error && <FormMessage>{error}</FormMessage>}
          {!data ? (
            <p className="text-center text-ink-muted">{t.auth.wait}</p>
          ) : (
            <>
              {data.schema && <FormMessage>{t.setup.outdated(data.schema.have, data.schema.need)}</FormMessage>}
              {!data.mail && <FormMessage tone="info">{t.admin.noMail}</FormMessage>}
              {/* This tree's invitations are on its members tab; others only when there are some */}
              {(!treeId || data.invites.some((i) => i.treeId !== treeId)) && (
                <InvitesCard
                  title={treeId ? t.manage.otherInvites : t.admin.openInvites}
                  invites={data.invites.filter((i) => !treeId || i.treeId !== treeId)}
                  date={date}
                  onRevoke={(id) => run(`/api/admin/invites/${id}`, null, 'DELETE')}
                />
              )}
              <TreesCard trees={data.trees} users={data.users} me={data.me} run={run} />
              <TrashCard trash={data.trash} date={date} run={run} />
              <UsersCard data={data} run={run} />
              <details className="group rounded-card border border-card-rule bg-card/70">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  {t.manage.developer}
                </summary>
                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                  <ImportCard onDone={load} />
                </div>
              </details>
            </>
          )}
        </main>
      </div>
    </>
  )
}

function InvitesCard({
  title,
  invites,
  date,
  onRevoke,
}: {
  title: string
  invites: Invite[]
  date: (iso: string) => string
  onRevoke: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <Card title={title}>
      {invites.length === 0 ? (
        <p className="text-sm text-ink-muted">{t.admin.noInvites}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-card-rule">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 text-[15px] text-ink">
                {[
                  i.email ?? t.admin.anyone,
                  i.tree && `${i.tree} (${t.roles[i.role ?? 'editor']})`,
                  i.admin && t.roles.admin,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                <span className="block text-[13px] text-ink-muted">
                  {t.admin.inviteMeta(i.inviter ?? '–', date(i.expiresAt))}
                </span>
              </span>
              <Button size="sm" variant="quiet" onClick={() => onRevoke(i.id)}>
                {t.admin.revoke}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

type Run = (url: string, body: object | null, method: string) => Promise<{ ok: boolean; data: Record<string, unknown> }>

function TreesCard({ trees, users, me, run }: { trees: Tree[]; users: AdminUserView[]; me: string; run: Run }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const members = (id: string) => users.filter((u) => u.trees.some((tr) => tr.id === id)).length
  const mine = new Set(users.find((u) => u.id === me)?.trees.map((tr) => tr.id) ?? [])

  return (
    <Card title={t.admin.treesTitle}>
      <ul className="mb-3 flex flex-col divide-y divide-card-rule">
        {trees.map((tree) => (
          <li key={tree.id} className="flex flex-wrap items-center gap-2 py-2">
            {editing?.id === tree.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await run(`/api/admin/trees/${tree.id}`, { name: editing.name }, 'PATCH')
                  setEditing(null)
                }}
              >
                <input
                  className="field h-9 flex-1 text-sm"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <Button size="sm" type="submit">
                  {t.form.save}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
                  {t.form.cancel}
                </Button>
              </form>
            ) : (
              <>
                {/* Admins see a tree's contents only as members, like everyone else */}
                {mine.has(tree.id) ? (
                  <Link
                    href={`/tree/${tree.id}`}
                    className="min-w-0 flex-1 truncate font-text text-[17px] font-semibold text-ink underline-offset-4 hover:underline"
                  >
                    {tree.name}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-text text-[17px] font-semibold text-ink">
                    {tree.name}{' '}
                    <span className="font-sans text-[13px] font-normal text-ink-muted">({t.admin.notMember})</span>
                  </span>
                )}
                <span className="text-[13px] text-ink-muted">{t.admin.memberCount(members(tree.id))}</span>
                <Button size="sm" variant="quiet" onClick={() => setEditing({ id: tree.id, name: tree.name })}>
                  {t.admin.rename}
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    window.confirm(t.admin.confirmDeleteTree(tree.name)) &&
                    run(`/api/admin/trees/${tree.id}`, null, 'DELETE')
                  }
                >
                  {t.admin.deleteTree}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          const { ok } = await run('/api/admin/trees', { name }, 'POST')
          if (ok) setName('')
        }}
      >
        <input
          className="field h-10 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.admin.newTreeName}
        />
        <Button type="submit" icon={<Plus className="h-4 w-4" />}>
          {t.admin.createTree}
        </Button>
      </form>
    </Card>
  )
}

function ImportCard({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setMessage(null)
    const form = new FormData()
    form.append('name', name)
    form.append('file', file)
    try {
      const { ok, data } = await sendForm('/api/trees/import', form)
      const tree = data.tree as { name: string } | undefined
      if (ok && tree) {
        setMessage({ tone: 'info', text: t.transfer.created(tree.name, Number(data.people)) })
        setName('')
        setFile(null)
        onDone()
      } else {
        setMessage({ tone: 'error', text: t.transfer.status[String(data.error)] ?? t.common.retry })
      }
    } catch {
      setMessage({ tone: 'error', text: t.common.offline })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t.transfer.importTitle}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t.transfer.importHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="field-label">{t.transfer.name}</span>
            <input className="field h-10" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">{t.transfer.file}</span>
            <input
              type="file"
              accept=".zip,.json,application/zip,application/json"
              className="text-sm text-ink"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
        </div>
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !file} icon={<Upload className="h-4 w-4" />}>
            {busy ? t.auth.wait : t.transfer.importButton}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function TrashCard({ trash, date, run }: { trash: DeletedTree[]; date: (iso: string) => string; run: Run }) {
  const { t } = useI18n()
  if (trash.length === 0) return null
  return (
    <Card title={t.admin.trashTitle}>
      <p className="mb-2 text-sm text-ink-muted">{t.admin.trashHint}</p>
      <ul className="flex flex-col divide-y divide-card-rule">
        {trash.map((tree) => (
          <li key={tree.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-text text-[17px] font-semibold text-ink">{tree.name}</span>
              <span className="block text-[13px] text-ink-muted">{t.admin.deletedOn(date(tree.deleted_at))}</span>
            </span>
            <Button size="sm" onClick={() => run(`/api/admin/trees/${tree.id}`, { restore: true }, 'PATCH')}>
              {t.admin.restore}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                window.confirm(t.admin.confirmPurge(tree.name)) &&
                run(`/api/admin/trees/${tree.id}?permanent=1`, null, 'DELETE')
              }
            >
              {t.admin.purge}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function UsersCard({ data, run }: { data: Overview; run: Run }) {
  const { t } = useI18n()
  const [resetLink, setResetLink] = useState<{ user: string; path: string; mailed: boolean } | null>(null)

  return (
    <Card title={t.admin.usersTitle}>
      <ul className="flex flex-col gap-3">
        {data.users.map((u) => {
          const self = u.id === data.me
          const missing = data.trees.filter((tr) => !u.trees.some((m) => m.id === tr.id))
          return (
            <li
              key={u.id}
              className={clsx('rounded-control border border-card-rule bg-card/70 p-3', u.disabled && 'opacity-70')}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-text text-[17px] font-semibold text-ink">{u.name}</span>
                <span className="text-sm text-ink-muted">{u.email}</span>
                {u.is_admin && <Badge>{t.roles.admin}</Badge>}
                {!u.verified && <Badge>{t.admin.unverified}</Badge>}
                {u.disabled && <Badge>{t.admin.disabled}</Badge>}
                {self && <Badge>{t.admin.you}</Badge>}
              </div>

              <p className="mt-2 text-[13px] font-medium text-ink-muted">
                {u.trees.length ? t.admin.memberOf : t.admin.inNoTree}
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {u.trees.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-[15px]">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-ink">
                      <span className="truncate">{m.name}</span>
                      {/* Set on the tree's members page, where the tree can be seen */}
                      {m.limited && <Badge>{t.members.access.badge}</Badge>}
                    </span>
                    <RoleSelect
                      className={clsx(select, 'w-40')}
                      value={m.role}
                      label={t.admin.role}
                      onChange={(role) => run(`/api/admin/users/${u.id}/trees/${m.id}`, { role }, 'PUT')}
                    />
                    <button
                      type="button"
                      aria-label={t.admin.removeFromTree(m.name)}
                      title={t.admin.removeFromTree(m.name)}
                      onClick={() => run(`/api/admin/users/${u.id}/trees/${m.id}`, null, 'DELETE')}
                      className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-danger"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {missing.length > 0 && (
                <AddToTree
                  trees={missing}
                  onAdd={(id, role) => run(`/api/admin/users/${u.id}/trees/${id}`, { role }, 'PUT')}
                />
              )}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-card-rule pt-2">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => run(`/api/admin/users/${u.id}`, { isAdmin: !u.is_admin }, 'PATCH')}
                >
                  {u.is_admin ? t.admin.revokeAdmin : t.admin.grantAdmin}
                </Button>
                {!self && (
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => run(`/api/admin/users/${u.id}`, { disabled: !u.disabled }, 'PATCH')}
                  >
                    {u.disabled ? t.admin.enable : t.admin.disable}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="quiet"
                  icon={<KeyRound className="h-4 w-4" />}
                  onClick={async () => {
                    const { ok, data: d } = await run(`/api/admin/users/${u.id}/reset`, null, 'POST')
                    if (ok) setResetLink({ user: u.id, path: String(d.path), mailed: !!d.mailed })
                  }}
                >
                  {t.admin.resetLink}
                </Button>
                {!self && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() =>
                      window.confirm(t.admin.confirmDelete(u.name)) && run(`/api/admin/users/${u.id}`, null, 'DELETE')
                    }
                  >
                    {t.admin.delete}
                  </Button>
                )}
              </div>
              {resetLink?.user === u.id && (
                <LinkBox path={resetLink.path} note={resetLink.mailed ? t.admin.resetMailed : t.admin.resetCopy} />
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Folded away by default, so it never reads like a membership */
function AddToTree({ trees, onAdd }: { trees: Tree[]; onAdd: (treeId: string, role: Role) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // Nothing preselected: the tree is always a deliberate choice, and only while it is still offered
  const [picked, setPicked] = useState('')
  const treeId = trees.some((tr) => tr.id === picked) ? picked : ''
  const [role, setRole] = useState<Role>('viewer')

  if (!open) {
    return (
      <div className="mt-1">
        <Button size="sm" variant="quiet" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t.admin.addToOtherTree}
        </Button>
      </div>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-dashed border-card-rule p-2">
      <select
        className={clsx(select, 'min-w-0 flex-1')}
        value={treeId}
        onChange={(e) => setPicked(e.target.value)}
        aria-label={t.admin.tree}
      >
        <option value="" disabled>
          {t.admin.chooseTree}
        </option>
        {trees.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.name}
          </option>
        ))}
      </select>
      <RoleSelect className={clsx(select, 'w-40')} value={role} label={t.admin.role} onChange={setRole} />
      <Button
        size="sm"
        disabled={!treeId}
        icon={<Plus className="h-4 w-4" />}
        onClick={() => {
          onAdd(treeId, role)
          setPicked('')
          setOpen(false)
        }}
      >
        {t.admin.addToTree}
      </Button>
      <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>
        {t.form.cancel}
      </Button>
    </div>
  )
}
