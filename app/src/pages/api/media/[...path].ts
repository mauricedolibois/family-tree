// Photos and documents of a tree, only for people who may see the tree; members
// whose part hides the rest only those of their part (lib/treeScope.ts). The
// storage bucket is private: the server fetches files with the service key and
// passes them through, byte ranges included (Safari plays videos only with them).

import type { NextApiRequest, NextApiResponse } from 'next'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebStream } from 'stream/web'
import { currentUser, treeMembership } from '@/lib/auth'
import { isUuid } from '@/lib/ids'
import { ALLOWED_TYPES, openMedia } from '@/lib/media'
import { logError } from '@/lib/log'
import { mayOpenInPart } from '@/lib/treeScope'

export const config = { api: { responseLimit: false } }

/** One path segment; uploads use [\w.-], older files may contain other characters */
const FILE_NAME = /^(?!\.\.?$)[^/\\]{1,300}$/
// Every upload gets a new name, so a file never changes; "private" keeps it out of shared caches
const CACHE = 'private, max-age=604800, immutable'
const PASSED_ON = ['content-length', 'content-range', 'accept-ranges', 'last-modified']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end()
  }
  const parts = Array.isArray(req.query.path) ? req.query.path : []
  const [rawTreeId, file] = parts
  if (parts.length !== 2 || !isUuid(rawTreeId) || !FILE_NAME.test(file)) return res.status(404).end()
  // Uploads store tree ids in lower case
  const treeId = rawTreeId.toLowerCase()

  try {
    // Same answer without access as for files that do not exist
    const user = await currentUser(req)
    const membership = user ? await treeMembership(user, treeId) : null
    if (!user || !membership) return res.status(404).end()
    const scope = membership.scope
    if (scope?.hideRest && !(await mayOpenInPart(user.id, treeId, scope, file))) return res.status(404).end()

    const headers: Record<string, string> = {
      // Content-Length must stay the length of what the browser receives
      'Accept-Encoding': 'identity',
    }
    if (typeof req.headers.range === 'string') headers.Range = req.headers.range
    if (typeof req.headers['if-none-match'] === 'string') headers['If-None-Match'] = req.headers['if-none-match']

    const abort = new AbortController()
    res.on('close', () => abort.abort())
    const upstream = await openMedia(treeId, file, { method: req.method, headers, signal: abort.signal })

    if (upstream.status === 416) return res.status(416).end()
    if (upstream.status !== 200 && upstream.status !== 206 && upstream.status !== 304) {
      if (upstream.status >= 500) logError('api/media', new Error(`storage answered ${upstream.status}`))
      return res.status(404).end()
    }

    // Supabase storage sends the ETag without quotes and does not answer If-None-Match itself
    const etag = quoteEtag(upstream.headers.get('etag'))
    if (etag) res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', CACHE)
    if (upstream.status === 304 || (etag && matchesEtag(req.headers['if-none-match'], etag))) {
      abort.abort()
      return res.status(304).end()
    }

    const type = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
    // Types the upload accepts are shown inline; anything else (older files) only as a download
    if (ALLOWED_TYPES.test(type)) {
      res.setHeader('Content-Type', type)
    } else {
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', 'attachment')
    }
    for (const name of PASSED_ON) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    res.status(upstream.status)

    if (req.method === 'HEAD' || !upstream.body) return res.end()
    Readable.fromWeb(upstream.body as unknown as NodeWebStream)
      .on('error', () => res.destroy())
      .pipe(res)
  } catch (err) {
    if (isAbort(err)) return
    logError('api/media', err)
    if (!res.headersSent) res.status(500).end()
  }
}

const quoteEtag = (etag: string | null) => (!etag ? null : /^(W\/)?"/.test(etag) ? etag : `"${etag}"`)

const matchesEtag = (header: string | string[] | undefined, etag: string) =>
  typeof header === 'string' &&
  header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, '') || tag.trim() === '*')

/** The browser went away (e.g. a video was skipped); nothing to report */
const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'
