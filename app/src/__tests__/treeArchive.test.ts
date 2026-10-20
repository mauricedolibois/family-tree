/**
 * @jest-environment node
 */
import { strToU8, zipSync } from 'fflate'
import { mapMediaUrls, mediaUrls, parseMediaUrl, safeName, typeFromName } from '@/lib/media'
import { IMPORT_LIMITS, ImportError, unpackImport } from '@/lib/treeArchive'
import type { StoredTree } from '@/storage/schema'

const T = '11111111-1111-1111-1111-111111111111'
const photo = `/api/media/${T}/0f0e-anna.jpg`
const tree: StoredTree = {
  version: 3,
  rootId: 'a',
  members: {
    a: {
      id: 'a',
      name: 'Anna',
      gender: 'FEMALE',
      childrenIds: [],
      profile: {
        titleImageUrl: photo,
        media: [
          { id: 'm1', kind: 'image', url: photo },
          { id: 'm2', kind: 'pdf', url: 'https://example.org/brief.pdf' },
        ],
      },
    },
  },
}

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (err) {
    return err instanceof ImportError ? err.code : String(err)
  }
  return 'no error'
}

describe('media links', () => {
  it('reads tree and file from /api/media links only', () => {
    expect(parseMediaUrl(photo)).toEqual({ treeId: T, file: '0f0e-anna.jpg' })
    expect(parseMediaUrl(`/api/media/${T.toUpperCase()}/Neues%20Foto.jpg`)).toEqual({
      treeId: T,
      file: 'Neues Foto.jpg',
    })
    for (const other of ['https://example.org/x.jpg', '/api/media/x', `/api/media/${T}/a/b.jpg`, 'media/x.jpg'])
      expect(parseMediaUrl(other)).toBeNull()
  })

  it('collects every link once and maps or drops them', () => {
    expect(mediaUrls(tree).sort()).toEqual([photo, 'https://example.org/brief.pdf'].sort())
    const mapped = mapMediaUrls(tree, (url) => (url === photo ? null : url))
    expect(mapped.members.a.profile?.titleImageUrl).toBeNull()
    expect(mapped.members.a.profile?.media?.map((m) => m.id)).toEqual(['m2'])
    // The original stays untouched
    expect(tree.members.a.profile?.media).toHaveLength(2)
  })

  it('accepts only the file types the upload accepts, with safe names', () => {
    expect(typeFromName('a.JPG')).toBe('image/jpeg')
    expect(typeFromName('clip.mov')).toBe('video/quicktime')
    for (const bad of ['x.html', 'x.svg', 'x.exe', 'noext']) expect(typeFromName(bad)).toBeNull()
    expect(safeName('../../Über uns!.jpg')).toBe('.._.._Uber_uns_.jpg')
  })
})

describe('unpacking imports', () => {
  it('takes a plain tree JSON', () => {
    const u = unpackImport(strToU8(JSON.stringify(tree)))
    expect((u.tree as StoredTree).members.a.name).toBe('Anna')
    expect(u.files.size).toBe(0)
  })

  it('takes an export ZIP and keeps only tree.json and allowed media files', () => {
    const zip = zipSync({
      'export.json': strToU8('{}'),
      'tree.json': strToU8(JSON.stringify(tree)),
      'media/0f0e-anna.jpg': new Uint8Array([1, 2, 3]),
      'media/evil.html': strToU8('<script>'),
      '../outside.jpg': new Uint8Array([4]),
    })
    const u = unpackImport(zip)
    expect([...u.files.keys()]).toEqual(['media/0f0e-anna.jpg'])
  })

  it('refuses unreadable files, missing tree.json and oversized content', () => {
    expect(code(() => unpackImport(strToU8('not json')))).toBe('unreadable')
    expect(code(() => unpackImport(zipSync({ 'media/a.jpg': new Uint8Array([1]) })))).toBe('unreadable')
    // Packs to almost nothing, unpacks beyond the per-file limit
    const bomb = zipSync({ 'tree.json': strToU8('{}'), 'media/big.jpg': new Uint8Array(IMPORT_LIMITS.fileBytes + 1) })
    expect(bomb.length).toBeLessThan(100_000)
    expect(code(() => unpackImport(bomb))).toBe('too large')
    const many = Object.fromEntries(
      Array.from({ length: IMPORT_LIMITS.files + 1 }, (_, i) => [`media/${i}.jpg`, new Uint8Array([1])]),
    )
    expect(code(() => unpackImport(zipSync({ 'tree.json': strToU8('{}'), ...many })))).toBe('too large')
  })
})
