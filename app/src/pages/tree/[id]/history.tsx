// History of one tree: earlier versions, what changed, who changed it. Moderators
// and admins restore a version or download it with its photos. Downloading the
// current tree and replacing it with a file are folded away for developers.

import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { ChevronRight, Download, RotateCcw, Upload } from 'lucide-react'
import type { VersionSummary } from '@/lib/db'
import { canManage, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { navContext, requirePageUser } from '@/lib/pageAuth'
import { nameList } from '@/storage/changes'
import { Button } from '@/components/ui/Button'
import { FormMessage, postJson } from '@/components/auth/AuthLayout'
import { PageHeader } from '@/components/app/PageHeader'
import type { NavContext } from '@/components/app/NavMenu'
import { Card, sendForm } from '@/components/manage/parts'
import { PageLoading } from '@/components/ui/Spinner'
import { useI18n } from '@/i18n/I18nProvider'
import { INTL_TAG, type Locale } from '@/i18n/locales'
import type { Messages } from '@/i18n/messages/de'
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

/** What the change after this version did, in the reader's language */
function changeText(v: VersionSummary, t: Messages['history']): string | null {
  const c = v.change
  // Versions from before the history page only have the stored note
  if (!c) return v.kind === 'change' ? v.note : null
  const list = (names: string[]) => nameList(names, t.more)
  const parts = [
    c.added.length ? t.added(list(c.added)) : null,
    c.removed.length ? t.removed(list(c.removed)) : null,
    c.edited.length ? t.edited(list(c.edited)) : null,
    c.relinked.length ? t.relinked(list(c.relinked)) : null,
  ].filter(Boolean)
  if (!parts.length && c.rootChanged) parts.push(t.rootChanged)
  return parts.join(' · ')
}

export default function HistoryPage({ treeId, nav }: Props) {
  const { t, locale } = useI18n()
  const [tree, setTree] = useState<{ name: string } | null>(null)
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const api = `/api/trees/${treeId}/history`
  const when = (iso: string) =>
    new Date(iso).toLocaleString(INTL_TAG[locale], { dateStyle: 'medium', timeStyle: 'short' })

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    if (!res.ok) return setMessage({ tone: 'error', text: t.common.retry })
    const data = (await res.json()) as { tree: { name: string }; versions: VersionSummary[] }
    setTree(data.tree)
    setVersions(data.versions)
    setMore(data.versions.length === 50)
  }, [api, t])

  useEffect(() => {
    void load()
  }, [load])

  const loadOlder = async () => {
    if (!versions?.length) return
    const res = await fetch(`${api}?before=${versions[versions.length - 1].id}`, { cache: 'no-store' })
    if (!res.ok) return setMessage({ tone: 'error', text: t.common.retry })
    const data = (await res.json()) as { versions: VersionSummary[] }
    setVersions([...versions, ...data.versions])
    setMore(data.versions.length === 50)
  }

  const restore = async (v: VersionSummary) => {
    if (!window.confirm(t.history.confirmRestore(when(v.created_at)))) return
    setBusy(v.id)
    setMessage(null)
    try {
      const { ok } = await postJson(`${api}/${v.id}`, {})
      setMessage(
        ok ? { tone: 'info', text: t.history.restored(when(v.created_at)) } : { tone: 'error', text: t.common.retry },
      )
      if (ok) await load()
    } catch {
      setMessage({ tone: 'error', text: t.common.offline })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Head>
        <title>{tree ? `${t.history.title} – ${tree.name}` : t.history.title}</title>
      </Head>
      <div className="page-backdrop min-h-dvh">
        <PageHeader title={t.nav.manageTree(nav.tree?.name ?? '')} nav={nav} current="history" />

        <main className="mx-auto flex max-w-3xl flex-col gap-5 p-3 sm:p-5">
          {tree && <p className="text-[15px] text-ink">{t.history.intro(tree.name)}</p>}
          {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
          {!versions ? (
            <PageLoading />
          ) : (
            <Card title={t.history.versions}>
              {versions.length === 0 ? (
                <p className="text-sm text-ink-muted">{t.history.empty}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-card-rule">
                  {versions.map((v) => {
                    const what = changeText(v, t.history)
                    const meta = [
                      what ? t.history.kind[v.kind] : null,
                      v.author ? t.history.by(v.author) : null,
                      when(v.created_at),
                      v.people != null ? t.history.people(v.people) : null,
                    ].filter(Boolean)
                    return (
                      <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] text-ink">{what ?? t.history.kind[v.kind]}</span>
                          <span className="block text-[13px] text-ink-muted">{meta.join(' · ')}</span>
                        </span>
                        <a
                          href={`${api}/${v.id}/download`}
                          title={t.history.download}
                          aria-label={t.history.download}
                          className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
                        >
                          <Download className="h-4 w-4" aria-hidden />
                        </a>
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          loading={busy === v.id}
                          icon={<RotateCcw className="h-4 w-4" />}
                          onClick={() => void restore(v)}
                        >
                          {busy === v.id ? t.auth.wait : t.history.restore}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {more && (
                <div className="mt-3">
                  <Button size="sm" variant="quiet" onClick={() => void loadOlder()}>
                    {t.history.older}
                  </Button>
                </div>
              )}
            </Card>
          )}
          {tree && (
            <details className="group rounded-card border border-card-rule bg-card/70">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-90"
                  aria-hidden
                />
                {t.manage.developer}
              </summary>
              <div className="flex flex-col gap-5 px-3 pb-3 sm:px-4 sm:pb-4">
                <Card title={t.manage.downloadTitle}>
                  <p className="mb-3 text-sm text-ink-muted">{t.manage.downloadHint}</p>
                  {/* The server sends a ZIP file with the tree and its photos; the page stays */}
                  <Button
                    icon={<Download className="h-4 w-4" />}
                    onClick={() => (window.location.href = `/api/trees/${treeId}/download`)}
                  >
                    {t.manage.downloadButton}
                  </Button>
                </Card>
                <ReplaceCard treeId={treeId} treeName={tree.name} onDone={() => void load()} />
              </div>
            </details>
          )}
        </main>
      </div>
    </>
  )
}

/** Replace the whole tree with a file; the current version lands in the history first */
function ReplaceCard({ treeId, treeName, onDone }: { treeId: string; treeName: string; onDone: () => void }) {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !window.confirm(t.transfer.confirmReplace(treeName))) return
    setBusy(true)
    setMessage(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const { ok, data } = await sendForm(`/api/trees/${treeId}/import`, form)
      setMessage(
        ok
          ? { tone: 'info', text: t.transfer.replaced(Number(data.people)) }
          : { tone: 'error', text: t.transfer.status[String(data.error)] ?? t.common.retry },
      )
      if (ok) onDone()
    } catch {
      setMessage({ tone: 'error', text: t.common.offline })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t.transfer.replaceTitle}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{t.transfer.replaceHint}</p>
        <input
          type="file"
          accept=".zip,.json,application/zip,application/json"
          className="text-sm text-ink"
          aria-label={t.transfer.file}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <div>
          <Button type="submit" loading={busy} disabled={!file} icon={<Upload className="h-4 w-4" />}>
            {busy ? t.auth.wait : t.transfer.replaceButton}
          </Button>
        </div>
      </form>
    </Card>
  )
}
