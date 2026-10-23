// Changes through the API only from the app's own pages. Browsers label every
// request with Sec-Fetch-Site. The session cookie is SameSite=Lax, which still
// counts other subdomains of the same domain as "same-site", so only same-origin
// may write. Clients without the header (scripts, calendar apps) are unaffected:
// they do not carry a browser's cookies.

import { NextResponse, type NextRequest } from 'next/server'

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS'])

export function proxy(req: NextRequest) {
  if (READ_ONLY.has(req.method)) return NextResponse.next()
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ error: 'cross-site request' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
