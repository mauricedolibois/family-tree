import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { NextApiRequest } from 'next'

const LOG_DIR = path.resolve(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'api.log')

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8')
}

function ipFromReq(req: NextApiRequest): string | undefined {
  const xf = (req.headers['x-forwarded-for'] || '') as string
  if (xf) return xf.split(',')[0]?.trim()
  // @ts-ignore - Node’s socket type
  return (req.socket?.remoteAddress as string) || undefined
}

function uaFromReq(req: NextApiRequest): string | undefined {
  return (req.headers['user-agent'] as string) || undefined
}

export type ApiLogMeta = Record<string, unknown>

type LogEventBase = {
  ts: string
  id: string
  route: string
  method: string
  ip?: string
  ua?: string
}

type RequestEvent = LogEventBase & {
  type: 'request'
  bodyKeys?: string[]
  query?: Record<string, unknown>
}

type ResponseEvent = LogEventBase & {
  type: 'response'
  status: number
  duration_ms: number
  meta?: ApiLogMeta
}

type ErrorEvent = LogEventBase & {
  type: 'error'
  status?: number
  duration_ms?: number
  error: string
  meta?: ApiLogMeta
}

async function append(line: object) {
  ensureLogFile()
  await fs.promises.appendFile(LOG_FILE, JSON.stringify(line) + '\n', 'utf8')
}

export function startApiLog(req: NextApiRequest, route: string) {
  const id = randomUUID()
  const startedAt = Date.now()
  const base = {
    id,
    route,
    method: req.method || 'UNKNOWN',
    ip: ipFromReq(req),
    ua: uaFromReq(req),
  }

  // write request-start
  void append({
    ...base,
    ts: new Date(startedAt).toISOString(),
    type: 'request',
    bodyKeys: req.body ? Object.keys(req.body as any) : [],
    query: req.query || {},
  } as RequestEvent)

  return {
    id,
    startedAt,
    async end(status: number, meta?: ApiLogMeta) {
      const now = Date.now()
      await append({
        ...base,
        ts: new Date(now).toISOString(),
        type: 'response',
        status,
        duration_ms: now - startedAt,
        meta,
      } as ResponseEvent)
    },
    async error(err: unknown, status?: number, meta?: ApiLogMeta) {
      const now = Date.now()
      const message = err instanceof Error ? err.message : String(err)
      await append({
        ...base,
        ts: new Date(now).toISOString(),
        type: 'error',
        status,
        duration_ms: now - startedAt,
        error: message,
        meta,
      } as ErrorEvent)
    },
  }
}
