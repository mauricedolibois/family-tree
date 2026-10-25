/**
 * Daily backup of all family trees into tree_backups.
 *
 * - Backs up a tree only if it changed since its last backup.
 * - Prunes automatic backups: snapshots before a change or a restore after
 *   90 days, daily ones after a year. Manual backups are kept forever.
 * - Deletes photos and documents only once neither the current tree nor any
 *   backup refers to them (and they are older than a week), so restored
 *   versions keep their images.
 * - Empties the trash: trees deleted more than 30 days ago go for good, with
 *   their backups and files.
 * On Vercel, where the app cannot run app/src/lib/dailyJob.ts itself, GitHub
 * Actions runs this script daily (.github/workflows/keep-alive.yml). It does the
 * same work as that job; change both together.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
/** How long automatic backups are kept (days), by kind; manual ones stay */
const KEEP = [
  { kind: 'change', days: 90 },
  { kind: 'restore', days: 90 },
  { kind: 'daily', days: 365 },
  { kind: 'import', days: 365 },
]
/** Deleted trees stay in the trash this long, then they go for good with their files */
const TRASH_DAYS = 30

/** Stable fingerprint of a JSON value (keys sorted). */
function fingerprint(value) {
  const stable = (v) =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')
}

async function main() {
  const { data: trees, error } = await supabase
    .from('trees')
    .select('id, data')
    .not('data', 'is', null)
    .is('deleted_at', null)
  if (error) throw error

  let saved = 0
  for (const t of trees) {
    const { data: last, error: lastErr } = await supabase
      .from('tree_backups')
      .select('data')
      .eq('tree_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (lastErr) throw lastErr
    if (last?.[0] && fingerprint(last[0].data) === fingerprint(t.data)) continue

    const { error: insErr } = await supabase
      .from('tree_backups')
      .insert({ tree_id: t.id, data: t.data, kind: 'daily', people: Object.keys(t.data.members ?? {}).length })
    if (insErr) throw insErr
    saved++
  }

  let removed = 0
  for (const { kind, days } of KEEP) {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
    const { count, error: delErr } = await supabase
      .from('tree_backups')
      .delete({ count: 'exact' })
      .eq('kind', kind)
      .lt('created_at', cutoff)
    if (delErr) throw delErr
    removed += count ?? 0
  }

  console.log(`✅ backed up ${saved} of ${trees.length} trees, removed ${removed} old automatic backups`)
}

const BUCKET = 'media'
const ORPHAN_DAYS = 7
/** Uploaded files are linked as /api/media/<tree>/<file> */
const MEDIA_PREFIX = '/api/media/'

/** Storage paths of all images and documents a tree refers to */
function collectPaths(tree, into) {
  const add = (url) => {
    if (typeof url !== 'string') return
    if (url.startsWith(MEDIA_PREFIX)) into.add(decodeURIComponent(url.slice(MEDIA_PREFIX.length).split('?')[0]))
  }
  for (const m of Object.values(tree?.members ?? {})) {
    add(m?.profile?.titleImageUrl)
    for (const md of m?.profile?.media ?? []) add(md?.url)
  }
}

/** Read all rows of a table in pages of 200 */
async function readAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 200) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 199)
    if (error) throw error
    rows.push(...data)
    if (data.length < 200) return rows
  }
}

/** Remove files no longer referenced by any tree or backup */
async function removeOrphanFiles() {
  const referenced = new Set()
  for (const row of await readAll('trees', 'data')) collectPaths(row.data, referenced)
  for (const row of await readAll('tree_backups', 'data')) collectPaths(row.data, referenced)
  if (referenced.size === 0) {
    console.log('ℹ️ no file references found; deleting nothing to be safe')
    return 0
  }

  const cutoff = Date.now() - ORPHAN_DAYS * 86400_000
  const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw error

  let removed = 0
  for (const folder of folders.filter((f) => !f.id)) {
    const orphans = []
    for (let offset = 0; ; offset += 1000) {
      const { data: files, error: listErr } = await supabase.storage
        .from(BUCKET)
        .list(folder.name, { limit: 1000, offset })
      if (listErr) throw listErr
      for (const f of files) {
        const path = `${folder.name}/${f.name}`
        const created = Date.parse(f.created_at ?? '')
        if (f.id && !referenced.has(path) && created && created < cutoff) orphans.push(path)
      }
      if (files.length < 1000) break
    }
    for (let i = 0; i < orphans.length; i += 100) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(orphans.slice(i, i + 100))
      if (rmErr) throw rmErr
    }
    removed += orphans.length
  }
  return removed
}

/** Trees in the trash for longer than TRASH_DAYS: files first, then the row (backups follow) */
async function emptyTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86400_000).toISOString()
  const { data: old, error } = await supabase.from('trees').select('id').lt('deleted_at', cutoff)
  if (error) throw error
  for (const { id } of old) {
    for (;;) {
      const { data: files, error: listErr } = await supabase.storage.from(BUCKET).list(id, { limit: 1000 })
      if (listErr) throw listErr
      if (!files.length) break
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`))
      if (rmErr) throw rmErr
      if (files.length < 1000) break
    }
    const { error: delErr } = await supabase.from('trees').delete().eq('id', id)
    if (delErr) throw delErr
  }
  return old.length
}

main()
  .then(async () => {
    const purged = await emptyTrash()
    if (purged) console.log(`🗑️ deleted ${purged} trees from the trash for good`)
    const files = await removeOrphanFiles()
    console.log(`🧹 removed ${files} unused files`)
  })
  .catch((err) => {
    console.error('❌ backup failed:', err)
    process.exit(1)
  })
