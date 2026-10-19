// src/lib/log.ts
// Fehler gehen in die Server-Logs (`docker logs family-tree-app`).
// Bewusst ohne Request-Bodys, Namen oder IPs.

/** Felder, die Supabase-, Postgres- und Node-Fehler zusätzlich zur Meldung mitbringen */
const DETAIL_FIELDS = ['code', 'status', 'details', 'hint'] as const

export function describeError(err: unknown): string {
  if (err instanceof Error || (typeof err === 'object' && err !== null)) {
    const e = err as Record<string, unknown>
    const message = typeof e.message === 'string' && e.message ? e.message : ''
    const extras = DETAIL_FIELDS.filter((k) => e[k] !== undefined && e[k] !== null && e[k] !== '').map(
      (k) => `${k}=${String(e[k])}`,
    )
    const name = typeof e.name === 'string' && e.name !== 'Error' ? `${e.name}: ` : ''
    const text = [message, ...extras].filter(Boolean).join(' | ')
    if (text) return name + text
    try {
      const json = JSON.stringify(err)
      if (json && json !== '{}') return name + json
    } catch {
      // zirkuläre Objekte: unten weiter
    }
    return name + (Object.prototype.toString.call(err) === '[object Object]' ? 'unbekannter Fehler' : String(err))
  }
  return String(err)
}

export function logError(where: string, err: unknown) {
  console.error(`[${where}] ${describeError(err)}`)
}
