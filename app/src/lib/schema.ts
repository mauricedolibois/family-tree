// Does the database match this app version? supabase/setup.sql and the scripts in
// supabase/migrations store the version in app_meta; the app only reads it and
// tells admins which script to run. Nothing here changes the database structure.

import { getSupaAdmin } from './supabaseServer'
import { logError } from './log'

/** Raise together with supabase/setup.sql when adding a migration */
export const REQUIRED_SCHEMA = 2

export type SchemaStatus =
  | { state: 'current'; have: number; need: number }
  // Older version, including installations from before setup.sql (version 0)
  | { state: 'outdated'; have: number; need: number }
  // No family tree tables at all: setup.sql has not run yet
  | { state: 'missing'; have: null; need: number }
  // Database not reachable or misconfigured: other errors will say more
  | { state: 'unknown'; have: null; need: number }

/** PostgREST answers for a table that does not exist (v12+ and older versions) */
const MISSING_TABLE = new Set(['PGRST205', '42P01'])
const RECHECK_MS = 30_000

// A current database stays current until the app is replaced; anything else is
// checked again shortly, so the warning goes away once the script has run.
let current: SchemaStatus | null = null
let lastCheck: { at: number; status: SchemaStatus } | null = null

export async function schemaStatus(): Promise<SchemaStatus> {
  if (current) return current
  if (lastCheck && Date.now() - lastCheck.at < RECHECK_MS) return lastCheck.status
  const status = await readStatus()
  if (status.state === 'current') current = status
  else lastCheck = { at: Date.now(), status }
  return status
}

async function readStatus(): Promise<SchemaStatus> {
  const need = REQUIRED_SCHEMA
  try {
    const { data, error } = await getSupaAdmin()
      .from('app_meta')
      .select('value')
      .eq('key', 'schema_version')
      .maybeSingle()
    if (error) {
      if (!MISSING_TABLE.has(error.code)) throw error
      return (await hasLegacyTables()) ? { state: 'outdated', have: 0, need } : { state: 'missing', have: null, need }
    }
    const have = Number.parseInt(data?.value ?? '0', 10) || 0
    return have >= need ? { state: 'current', have, need } : { state: 'outdated', have, need }
  } catch (err) {
    logError('schema', err)
    return { state: 'unknown', have: null, need }
  }
}

/** Installations from before setup.sql kept their trees in `families` */
async function hasLegacyTables(): Promise<boolean> {
  const { error } = await getSupaAdmin().from('families').select('id').limit(1)
  if (!error) return true
  if (MISSING_TABLE.has(error.code)) return false
  throw error
}

/** For tests */
export function resetSchemaCache() {
  current = null
  lastCheck = null
}
