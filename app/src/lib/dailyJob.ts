// The daily job, run by the app server itself every night at 03:00 UTC, so the
// server needs no cron and nothing touches Supabase's containers. It only uses the
// API with the app's own key, like every other request.
//
// - Adds a daily version of every tree that changed since its last version.
// - Prunes automatic versions: snapshots before a change or a restore after 90
//   days, daily ones after a year. Manual versions are kept forever.
// - Empties the trash: trees deleted more than 30 days ago go for good, with their
//   versions and files.
// - Deletes photos and documents only once neither a tree nor any version refers
//   to them (and they are older than a week), so restored versions keep their images.

import { createHash } from 'crypto'
import { getSupaAdmin } from './supabaseServer'
import { schemaStatus } from './schema'
import { logError } from './log'
import type { StoredTree } from '@/storage/schema'

/** Hour of the day (UTC) the job runs */
export const DAILY_HOUR_UTC = 3
/** How long automatic versions are kept (days), by kind; manual ones stay */
const KEEP = [
  { kind: 'change', days: 90 },
  { kind: 'restore', days: 90 },
  { kind: 'daily', days: 365 },
  { kind: 'import', days: 365 },
]
/** Deleted trees stay in the trash this long, then they go for good with their files */
const TRASH_DAYS = 30
/** Unreferenced files younger than this stay: the upload may belong to a form still open */
const ORPHAN_DAYS = 7
const BUCKET = 'media'
/** Uploaded files are linked as /api/media/<tree>/<file> */
const MEDIA_PREFIX = '/api/media/'
const DAY = 86_400_000
/** A timer that fires a moment early must not run the job twice */
const MARGIN = 5 * 60_000

/** Milliseconds from `now` until the next time the clock shows `hour`:00 UTC */
export function msUntilNext(now: number, hour = DAILY_HOUR_UTC): number {
  const wait = (hour * 3_600_000 - (now % DAY) + DAY) % DAY
  return wait === 0 ? DAY : wait
}

/** Stable fingerprint of a JSON value (keys sorted) */
export function fingerprint(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
          )
        : v
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')
}

/** Adds the storage paths of all images and documents a tree refers to */
export function collectPaths(tree: Partial<StoredTree> | null | undefined, into: Set<string>) {
  const add = (url: unknown) => {
    if (typeof url === 'string' && url.startsWith(MEDIA_PREFIX)) {
      into.add(decodeURIComponent(url.slice(MEDIA_PREFIX.length).split('?')[0]))
    }
  }
  for (const m of Object.values(tree?.members ?? {})) {
    add(m?.profile?.titleImageUrl)
    for (const md of m?.profile?.media ?? []) add(md?.url)
  }
}

/** A daily version of every changed tree, then pruning; returns the counts */
async function backUpTrees() {
  const db = getSupaAdmin()
  const { data: trees, error } = await db
    .from('trees')
    .select('id, data')
    .not('data', 'is', null)
    .is('deleted_at', null)
  if (error) throw error

  let saved = 0
  for (const t of trees as Array<{ id: string; data: StoredTree }>) {
    const { data: last, error: lastErr } = await db
      .from('tree_backups')
      .select('data')
      .eq('tree_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (lastErr) throw lastErr
    if (last?.[0] && fingerprint(last[0].data) === fingerprint(t.data)) continue

    const { error: insErr } = await db
      .from('tree_backups')
      .insert({ tree_id: t.id, data: t.data, kind: 'daily', people: Object.keys(t.data.members ?? {}).length })
    if (insErr) throw insErr
    saved++
  }

  let pruned = 0
  for (const { kind, days } of KEEP) {
    const { count, error: delErr } = await db
      .from('tree_backups')
      .delete({ count: 'exact' })
      .eq('kind', kind)
      .lt('created_at', new Date(Date.now() - days * DAY).toISOString())
    if (delErr) throw delErr
    pruned += count ?? 0
  }
  return { trees: trees.length, saved, pruned }
}

/** Reads all rows of a table in pages of 200 */
async function readAll(table: string, columns: string) {
  const rows: Array<Record<string, unknown>> = []
  for (let from = 0; ; from += 200) {
    const { data, error } = await getSupaAdmin()
      .from(table)
      .select(columns)
      .range(from, from + 199)
    if (error) throw error
    const page = data as unknown as Array<Record<string, unknown>>
    rows.push(...page)
    if (page.length < 200) return rows
  }
}

/** Trees in the trash for longer than TRASH_DAYS: files first, then the row (versions follow) */
async function emptyTrash() {
  const db = getSupaAdmin()
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY).toISOString()
  const { data: old, error } = await db.from('trees').select('id').lt('deleted_at', cutoff)
  if (error) throw error
  for (const { id } of old as Array<{ id: string }>) {
    for (;;) {
      const { data: files, error: listErr } = await db.storage.from(BUCKET).list(id, { limit: 1000 })
      if (listErr) throw listErr
      if (!files.length) break
      const { error: rmErr } = await db.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`))
      if (rmErr) throw rmErr
      if (files.length < 1000) break
    }
    const { error: delErr } = await db.from('trees').delete().eq('id', id)
    if (delErr) throw delErr
  }
  return old.length
}

/** Removes files no tree and no version refers to any more */
async function removeOrphanFiles() {
  const db = getSupaAdmin()
  const referenced = new Set<string>()
  for (const row of await readAll('trees', 'data')) collectPaths(row.data as StoredTree, referenced)
  for (const row of await readAll('tree_backups', 'data')) collectPaths(row.data as StoredTree, referenced)
  // No reference at all looks more like a failed read than an empty installation
  if (referenced.size === 0) return 0

  const cutoff = Date.now() - ORPHAN_DAYS * DAY
  const { data: folders, error } = await db.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw error

  let removed = 0
  for (const folder of folders.filter((f) => !f.id)) {
    const orphans: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data: files, error: listErr } = await db.storage.from(BUCKET).list(folder.name, { limit: 1000, offset })
      if (listErr) throw listErr
      for (const f of files) {
        const path = `${folder.name}/${f.name}`
        const created = Date.parse(f.created_at ?? '')
        if (f.id && !referenced.has(path) && created && created < cutoff) orphans.push(path)
      }
      if (files.length < 1000) break
    }
    for (let i = 0; i < orphans.length; i += 100) {
      const { error: rmErr } = await db.storage.from(BUCKET).remove(orphans.slice(i, i + 100))
      if (rmErr) throw rmErr
    }
    removed += orphans.length
  }
  return removed
}

let running = false

/** Runs the job once; errors go to the log, never to the caller */
export async function runDailyJob(): Promise<void> {
  if (running) return
  running = true
  try {
    // An empty or outdated database is reported at start; the tables may not match
    if ((await schemaStatus()).state !== 'current') {
      console.warn('[daily] skipped: the database is not at the version this app needs')
      return
    }
    const { trees, saved, pruned } = await backUpTrees()
    const purged = await emptyTrash()
    const files = await removeOrphanFiles()
    console.log(
      `[daily] versions of ${saved} of ${trees} trees, ${pruned} old versions pruned, ` +
        `${purged} trees deleted from the trash, ${files} unused files removed`,
    )
  } catch (err) {
    logError('daily', err)
  } finally {
    running = false
  }
}

/** Runs the job every day at DAILY_HOUR_UTC while the server runs */
export function scheduleDailyJob() {
  const next = () => {
    // unref: the timer alone must not keep a stopping server alive
    setTimeout(
      () => {
        void runDailyJob().finally(next)
      },
      MARGIN + msUntilNext(Date.now() + MARGIN),
    ).unref()
  }
  next()
}
