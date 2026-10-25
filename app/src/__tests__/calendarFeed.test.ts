/**
 * @jest-environment node
 */
// Calendar subscription for members who see only their part of the tree: they get
// a link of their own whose feed holds just the people they see, decided when the
// feed is fetched. The tree's link keeps holding everyone.
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Person, Tree } from '@/family/model'
import type { TreeScope } from '@/family/scope'
import type { Membership } from '@/lib/accounts'

jest.mock('@/lib/db', () => ({
  getTreeByCalendarToken: jest.fn(),
  getMemberByCalendarToken: jest.fn(),
  loadTree: jest.fn(),
  getCalendarToken: jest.fn(),
  renewCalendarToken: jest.fn(),
  getMemberCalendarToken: jest.fn(),
  renewMemberCalendarToken: jest.fn(),
}))
jest.mock('@/lib/accounts', () => ({ getTree: jest.fn(), getUser: jest.fn(), membershipIn: jest.fn() }))
jest.mock('@/lib/auth', () => ({
  ...jest.requireActual('@/lib/auth'),
  // Signed in as u1; who that is in the tree comes from treeMembership
  withUser: (_name: string, handler: (req: unknown, res: unknown, user: { id: string }) => unknown) => {
    return (req: unknown, res: unknown) => handler(req, res, { id: 'u1' })
  },
  treeMembership: jest.fn(),
}))
jest.mock('@/lib/log', () => ({ logError: jest.fn() }))

import * as db from '@/lib/db'
import * as accounts from '@/lib/accounts'
import * as auth from '@/lib/auth'
import feed from '@/pages/api/kalender/[token]'
import link from '@/pages/api/trees/[id]/calendar'

const mocked = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.Mock

// G + H -> Y. Y married X; their child K. X's family: P1 + P2 -> X and sister S.
const person = (id: string, birthDate: string, extra: Partial<Person> = {}): Person => ({
  id,
  name: `Person ${id}`,
  gender: 'FEMALE',
  spouseId: null,
  parentIds: [],
  childrenIds: [],
  adoptedChildrenIds: [],
  profile: { birthDate, deathDate: null, media: [] },
  ...extra,
})
const tree: Tree = {
  version: 3,
  rootId: 'G',
  members: {
    G: person('G', '1940-01-05', { gender: 'MALE', spouseId: 'H', childrenIds: ['Y'] }),
    H: person('H', '1942-02-06', { spouseId: 'G', childrenIds: ['Y'] }),
    Y: person('Y', '1970-03-07', { gender: 'MALE', spouseId: 'X', parentIds: ['G', 'H'], childrenIds: ['K'] }),
    X: person('X', '1972-04-08', { spouseId: 'Y', parentIds: ['P1', 'P2'], childrenIds: ['K'] }),
    K: person('K', '2000-05-09', { parentIds: ['Y', 'X'] }),
    P1: person('P1', '1945-06-10', { gender: 'MALE', spouseId: 'P2', childrenIds: ['X', 'S'] }),
    P2: person('P2', '1946-07-11', { spouseId: 'P1', childrenIds: ['X', 'S'] }),
    S: person('S', '1975-08-12', { parentIds: ['P1', 'P2'] }),
  },
}

// Y and his descendants, with the rest hidden: Y, X (married in) and K
const part: TreeScope = { lines: [{ person: 'Y', up: 0, down: null }], stops: [], unlock: [], lock: [], hideRest: true }
const partMember: Membership = { role: 'viewer', scope: part, personId: 'K' }

const TREE_TOKEN = 'tree-token-0123456789abcdef'
const MEMBER_TOKEN = 'member-token-0123456789abcdef'

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, req: Partial<NextApiRequest>) {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> }
  const res = {
    headersSent: false,
    setHeader: (k: string, v: string) => ((out.headers[k] = v), res),
    status: (s: number) => ((out.status = s), res),
    json: (b: unknown) => ((out.body = b), res),
    send: (b: unknown) => ((out.body = b), res),
    end: () => res,
  }
  return Promise.resolve(
    handler({ method: 'GET', query: {}, headers: {}, ...req } as NextApiRequest, res as never),
  ).then(() => out)
}

const birthdaysIn = (ics: unknown) =>
  [...String(ics).matchAll(/^SUMMARY:🎂 Person (\w+) /gm)]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()

beforeEach(() => {
  jest.clearAllMocks()
  mocked(db.getTreeByCalendarToken).mockImplementation(async (t: string) =>
    t === TREE_TOKEN ? { id: 'tree1', name: 'Sippe' } : null,
  )
  mocked(db.getMemberByCalendarToken).mockImplementation(async (t: string) =>
    t === MEMBER_TOKEN ? { userId: 'u2', treeId: 'tree1' } : null,
  )
  mocked(db.loadTree).mockResolvedValue({ tree, version: 'v1' })
  mocked(accounts.getTree).mockResolvedValue({ id: 'tree1', name: 'Sippe' })
  mocked(accounts.getUser).mockResolvedValue({ id: 'u2', disabled_at: null })
  mocked(accounts.membershipIn).mockResolvedValue(partMember)
})

describe('calendar feed', () => {
  it("the tree's link holds everyone", async () => {
    const r = await call(feed, { query: { token: `${TREE_TOKEN}.ics` } })
    expect(r.status).toBe(200)
    expect(birthdaysIn(r.body)).toEqual(['G', 'H', 'K', 'P1', 'P2', 'S', 'X', 'Y'])
  })

  it("a member's own link holds only the people they see", async () => {
    const r = await call(feed, { query: { token: `${MEMBER_TOKEN}.ics` } })
    expect(r.status).toBe(200)
    expect(birthdaysIn(r.body)).toEqual(['K', 'X', 'Y'])
    expect(String(r.body)).toContain('X-WR-CALNAME:Geburtstage Sippe')
  })

  it('a line within the part narrows it further', async () => {
    const r = await call(feed, { query: { token: `${MEMBER_TOKEN}.ics`, linie: 'K', vorfahren: '1', nachkommen: '0' } })
    expect(birthdaysIn(r.body)).toEqual(['K', 'X', 'Y'])
    const own = await call(feed, { query: { token: `${MEMBER_TOKEN}.ics`, linie: 'K', vorfahren: '0' } })
    expect(birthdaysIn(own.body)).toEqual(['K'])
  })

  it('a line of someone outside the part gives no one, never the hidden family', async () => {
    for (const linie of ['G', 'S', 'P1']) {
      const r = await call(feed, { query: { token: `${MEMBER_TOKEN}.ics`, linie, vorfahren: 'alle', seiten: 'alle' } })
      expect(r.status).toBe(200)
      expect(birthdaysIn(r.body)).toEqual([])
    }
  })

  it('follows the part as it is now', async () => {
    mocked(accounts.membershipIn).mockResolvedValue({
      ...partMember,
      scope: { ...part, lines: [{ person: 'Y', up: 1, down: null }] },
    })
    const wider = await call(feed, { query: { token: `${MEMBER_TOKEN}.ics` } })
    expect(birthdaysIn(wider.body)).toEqual(['G', 'H', 'K', 'X', 'Y'])
    // Rest visible or no part any more: they see everything, so does the feed
    mocked(accounts.membershipIn).mockResolvedValue({ ...partMember, scope: null })
    const whole = await call(feed, { query: { token: `${MEMBER_TOKEN}.ics` } })
    expect(birthdaysIn(whole.body)).toHaveLength(8)
  })

  it('stops with the membership, a disabled account or a deleted tree', async () => {
    const get = () => call(feed, { query: { token: `${MEMBER_TOKEN}.ics` } })
    mocked(accounts.membershipIn).mockResolvedValueOnce(null)
    expect((await get()).status).toBe(404)
    mocked(accounts.getUser).mockResolvedValueOnce({ id: 'u2', disabled_at: '2026-10-01T00:00:00Z' })
    expect((await get()).status).toBe(404)
    mocked(accounts.getUser).mockResolvedValueOnce(null)
    expect((await get()).status).toBe(404)
    mocked(accounts.getTree).mockResolvedValueOnce(null)
    expect((await get()).status).toBe(404)
    expect((await get()).status).toBe(200)
  })

  it('unknown and malformed links are 404', async () => {
    expect((await call(feed, { query: { token: 'unknown-token-0123456789abcdef.ics' } })).status).toBe(404)
    expect((await call(feed, { query: { token: 'short' } })).status).toBe(404)
  })
})

describe('calendar link', () => {
  beforeEach(() => {
    mocked(db.getCalendarToken).mockResolvedValue(TREE_TOKEN)
    mocked(db.renewCalendarToken).mockResolvedValue('new-tree-token-0123456789')
    mocked(db.getMemberCalendarToken).mockResolvedValue(MEMBER_TOKEN)
    mocked(db.renewMemberCalendarToken).mockResolvedValue('new-member-token-0123456789')
  })
  const as = (m: Membership | null) => mocked(auth.treeMembership).mockResolvedValue(m)
  const req = (method: string) => ({ method, query: { id: '11111111-1111-4111-8111-111111111111' } })

  it('a member who sees only their part gets their own link and may renew it', async () => {
    as(partMember)
    expect((await call(link, req('GET'))).body).toEqual({ path: `/api/kalender/${MEMBER_TOKEN}.ics` })
    expect(db.getMemberCalendarToken).toHaveBeenCalledWith('u1', '11111111-1111-4111-8111-111111111111')
    expect((await call(link, req('POST'))).body).toEqual({ path: '/api/kalender/new-member-token-0123456789.ics' })
    expect(db.getCalendarToken).not.toHaveBeenCalled()
    expect(db.renewCalendarToken).not.toHaveBeenCalled()
  })

  it('everyone else gets the link of the tree; only editors with the whole tree renew it', async () => {
    as({ role: 'viewer', scope: null, personId: null })
    expect((await call(link, req('GET'))).body).toEqual({ path: `/api/kalender/${TREE_TOKEN}.ics` })
    expect((await call(link, req('POST'))).status).toBe(403)
    as({ role: 'editor', scope: { ...part, hideRest: false }, personId: null })
    expect((await call(link, req('GET'))).body).toEqual({ path: `/api/kalender/${TREE_TOKEN}.ics` })
    expect((await call(link, req('POST'))).status).toBe(403)
    as({ role: 'editor', scope: null, personId: null })
    expect((await call(link, req('POST'))).status).toBe(200)
    expect(db.getMemberCalendarToken).not.toHaveBeenCalled()
    expect(db.renewMemberCalendarToken).not.toHaveBeenCalled()
  })

  it('not a member: 404', async () => {
    as(null)
    expect((await call(link, req('GET'))).status).toBe(404)
  })
})
