/**
 * Tägliche Sicherung aller Stammbäume in die Tabelle family_trees_backup.
 *
 * - Sichert einen Baum nur, wenn er sich seit der letzten Sicherung geändert hat.
 * - Löscht automatische Sicherungen nach 60 Tagen; manuelle bleiben für immer.
 * Läuft täglich im GitHub-Workflow „Keep Supabase Alive“.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const KEEP_DAYS = 60
const NOTE = 'automatisch: tägliche Sicherung'

/** Stabiler Fingerabdruck eines JSON-Werts (Schlüssel sortiert). */
function fingerprint(value) {
  const stable = (v) =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]))
        : v
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
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

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString()
  const { count, error: delErr } = await supabase
    .from('family_trees_backup')
    .delete({ count: 'exact' })
    .like('note', 'automatisch:%')
    .lt('backed_up_at', cutoff)
  if (delErr) throw delErr

  console.log(`✅ ${saved} von ${trees.length} Stammbäumen gesichert, ${count ?? 0} alte automatische Sicherungen entfernt`)
}

main().catch((err) => {
  console.error('❌ Sicherung fehlgeschlagen:', err)
  process.exit(1)
})
