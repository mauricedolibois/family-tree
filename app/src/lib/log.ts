// src/lib/log.ts
// Fehler gehen in die Server-Logs (bei Vercel unter „Logs“ sichtbar).
// Bewusst ohne Request-Bodys, Namen oder IPs.

export function logError(where: string, err: unknown) {
  const message = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err)
  console.error(`[${where}] ${message}`)
}
