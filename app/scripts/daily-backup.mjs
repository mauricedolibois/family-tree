/**
 * Daily backup of all family trees into family_trees_backup.
 *
 * - Backs up a tree only if it changed since its last backup.
 * - Prunes automatic backups: pre-change snapshots after 90 days, daily ones
 *   after a year. Manual backups are kept forever.
 * - Deletes photos and documents only once neither the current tree nor any
 *   backup refers to them (and they are older than a week), so restored
 *   versions keep their images.
 * Runs daily via cron inside the app container (see README, "Deployment").
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
// The notes are stored with every backup and matched by prefix below, so they
// stay German to keep pruning working for existing rows.
const NOTE = 'automatisch: tägliche Sicherung'
/** How long automatic backups are kept (days), by note prefix */
const KEEP = [
  { prefix: 'automatisch: vor %', days: 90 },
  { prefix: 'automatisch: tägliche%', days: 365 },
]

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
  const { data: trees, error } = await supabase.from('family_trees').select('family_id, tree_json')
  if (error) throw error

  let saved = 0
  for (const t of trees) {
    const { data: last, error: lastErr } = await supabase
      .from('family_trees_backup')
      .select('tree_json')
      .eq('family_id', t.family_id)
      .order('backed_up_at', { ascending: false })
      .limit(1)
    if (lastErr) throw lastErr
    if (last?.[0] && fingerprint(last[0].tree_json) === fingerprint(t.tree_json)) continue

    const { error: insErr } = await supabase
      .from('family_trees_backup')
      .insert({ family_id: t.family_id, tree_json: t.tree_json, note: NOTE })
    if (insErr) throw insErr
    saved++
  }

  let removed = 0
  for (const { prefix, days } of KEEP) {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
    const { count, error: delErr } = await supabase
      .from('family_trees_backup')
      .delete({ count: 'exact' })
      .like('note', prefix)
      .lt('backed_up_at', cutoff)
    if (delErr) throw delErr
    removed += count ?? 0
  }

  console.log(`✅ backed up ${saved} of ${trees.length} trees, removed ${removed} old automatic backups`)
}

const BUCKET = 'media'
const ORPHAN_DAYS = 7
const PUBLIC_MARKER = `/object/public/${BUCKET}/`

/** Storage paths of all images and documents a tree refers to */
function collectPaths(tree, into) {
  const add = (url) => {
    if (typeof url !== 'string') return
    const i = url.indexOf(PUBLIC_MARKER)
    if (i >= 0) into.add(decodeURIComponent(url.slice(i + PUBLIC_MARKER.length).split('?')[0]))
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
  for (const row of await readAll('family_trees', 'family_id, tree_json')) collectPaths(row.tree_json, referenced)
  for (const row of await readAll('family_trees_backup', 'tree_json')) collectPaths(row.tree_json, referenced)
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

main()
  .then(async () => {
    const files = await removeOrphanFiles()
    console.log(`🧹 removed ${files} unused files`)
  })
  .catch((err) => {
    console.error('❌ backup failed:', err)
    process.exit(1)
  })
