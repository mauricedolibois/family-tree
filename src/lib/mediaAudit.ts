// src/lib/mediaAudit.ts
import { supaAdmin } from '@/lib/supabaseServer'

/**
 * Aus einem Storage-Key wie "fid/550e8400-e29b-41d4-a716-446655440000-foto.jpg"
 * extrahiert:
 *  - basename: "550e8400-e29b-41d4-a716-446655440000-foto.jpg"
 *  - uuidLike: "550e8400-e29b-41d4-a716-446655440000" (falls vorhanden), sonst null
 */
function parseNamePartsFromKey(key: string): { basename: string; uuidLike: string | null } {
  const parts = key.split('/')
  const basename = parts[parts.length - 1] ?? key
  const m = basename.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return { basename, uuidLike: m ? m[0] : null }
}

/**
 * Lädt alle JSON-Trees und baut eine große Suchbasis (Strings).
 * (Bei sehr großen Datenmengen alternativ paginieren oder serverseitig streamen.)
 */
async function loadAllFamilyTreesAsStrings(): Promise<string[]> {
  const { data, error } = await supaAdmin
    .from('family_trees')
    .select('tree_json')

  if (error) throw error
  const sources: string[] = []
  for (const row of data ?? []) {
    const j = (row as any).tree_json
    // robust: stringify, um überall Stringsuche zu erlauben
    sources.push(JSON.stringify(j))
  }
  return sources
}

/**
 * Listet alle Keys in allen Familienordnern (Prefix = fid/).
 */
async function listAllMediaKeys(): Promise<string[]> {
  // 1) alle family-IDs holen
  const { data: fams, error: famErr } = await supaAdmin
    .from('families')
    .select('id')
  if (famErr) throw famErr

  const all: string[] = []
  const pageSize = 100

  for (const f of (fams ?? []) as { id: string }[]) {
    const prefix = f.id
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: objs, error: listErr } = await supaAdmin.storage
        .from('media')
        .list(prefix, { limit: pageSize, offset })
      if (listErr) throw listErr
      if (!objs || objs.length === 0) break

      for (const o of objs) {
        if (o.name) all.push(`${prefix}/${o.name}`)
      }
      if (objs.length < pageSize) break
      offset += pageSize
    }
  }
  return all
}

/**
 * Prüft, ob ein "Name" (basename oder UUID) in irgendeinem Tree-String vorkommt.
 */
function isNameReferencedInAnyTree(needle: string, trees: string[]): boolean {
  if (!needle) return false
  // einfache includes-Suche; bei Bedarf auf Regex oder Wortgrenzen erweitern
  for (const src of trees) {
    if (src.includes(needle)) return true
  }
  return false
}

/**
 * DIE geforderte Methode:
 * Geht alle Medien durch und checkt pro Datei, ob deren Name/ID in einem JSON-Tree vorkommt.
 * - Referenz gilt, wenn EINE der Suchnadeln gefunden wird:
 *   1) vollständiger Basename (z. B. "uuid-name.jpg")
 *   2) UUID-Teil (falls vorhanden)
 *   3) Storage-Key (zur Sicherheit)
 */
export async function auditMediaUsageByName(): Promise<{
  total: number
  referenced: number
  unreferenced: number
  referencedKeys: string[]
  unreferencedKeys: string[]
}> {
  const [trees, keys] = await Promise.all([
    loadAllFamilyTreesAsStrings(),
    listAllMediaKeys(),
  ])

  const referencedKeys: string[] = []
  const unreferencedKeys: string[] = []

  for (const key of keys) {
    const { basename, uuidLike } = parseNamePartsFromKey(key)

    const found =
      isNameReferencedInAnyTree(basename, trees) ||
      (uuidLike ? isNameReferencedInAnyTree(uuidLike, trees) : false) ||
      isNameReferencedInAnyTree(key, trees)

    if (found) {
      referencedKeys.push(key)
    } else {
      unreferencedKeys.push(key)
    }
  }

  return {
    total: keys.length,
    referenced: referencedKeys.length,
    unreferenced: unreferencedKeys.length,
    referencedKeys,
    unreferencedKeys,
  }
}

/**
 * Optional: wenn du anschließend die Unreferenzierten löschen willst.
 * Kannst du separat aufrufen; die Audit-Methode bleibt reine Prüfung.
 */
export async function deleteKeys(keys: string[]): Promise<number> {
  if (!keys.length) return 0
  const BATCH = 100
  let deleted = 0
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH)
    const { error } = await supaAdmin.storage.from('media').remove(chunk)
    if (error) throw error
    deleted += chunk.length
  }
  return deleted
}
