// Export and import of whole trees.
//
// An export is a ZIP file:
//   export.json   what this is: format, version, tree name, date
//   tree.json     the tree as stored, links to its files rewritten to media/<file>
//   media/…       the photos and documents
// Imports take such a ZIP file or a plain tree JSON (the backup from the menu).

import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import { IncomingForm, type File } from 'formidable'
import { Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8, unzipSync } from 'fflate'
import type { StoredTree } from '@/storage/schema'
import { validateStoredTree } from '@/storage/validate'
import { mapMediaUrls, mediaUrls, openMedia, parseMediaUrl, storeMedia, typeFromName } from './media'

export const EXPORT_FORMAT = 'family-tree-export'
const EXPORT_VERSION = 1

export const IMPORT_LIMITS = {
  /** Size of the uploaded file */
  archiveBytes: 200 * 1024 * 1024,
  /** Everything inside a ZIP file after unpacking */
  unpackedBytes: 1024 * 1024 * 1024,
  fileBytes: 25 * 1024 * 1024,
  files: 2000,
}

// ── Export ───────────────────────────────────────────────────────────────────

/** ASCII file name for a download, e.g. stammbaum-reiser-2026-10-20.zip */
export const downloadName = (name: string, date: Date) =>
  `stammbaum-${
    name
      .normalize('NFKD')
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'export'
  }-${date.toISOString().slice(0, 10)}.zip`

/**
 * Writes the export ZIP of a tree to the response. `mayRead(treeId)` decides which
 * linked files go in: those of other trees only if the user may see them.
 */
export async function writeExport(
  res: ServerResponse,
  input: { name: string; tree: StoredTree; mayRead: (treeId: string) => Promise<boolean> },
): Promise<void> {
  // Files that go into the archive, keyed by their link
  const files = new Map<string, { treeId: string; file: string; path: string }>()
  for (const url of mediaUrls(input.tree)) {
    const ref = parseMediaUrl(url)
    if (!ref || !(await input.mayRead(ref.treeId))) continue
    files.set(url, { ...ref, path: `media/${ref.treeId.slice(0, 8)}-${ref.file}` })
  }
  const tree = mapMediaUrls(input.tree, (url) => files.get(url)?.path ?? url)

  const zip = new Zip()
  const drained = () => new Promise<void>((resolve) => res.once('drain', resolve))
  let pending: Promise<void> = Promise.resolve()
  zip.ondata = (err, chunk, final) => {
    if (err) return res.destroy(err)
    if (!res.write(chunk)) pending = drained()
    if (final) res.end()
  }
  const addText = (path: string, text: string) => {
    const entry = new ZipDeflate(path, { level: 6 })
    zip.add(entry)
    entry.push(strToU8(text), true)
  }

  addText(
    'export.json',
    JSON.stringify(
      { format: EXPORT_FORMAT, version: EXPORT_VERSION, name: input.name, exportedAt: new Date().toISOString() },
      null,
      2,
    ),
  )
  addText('tree.json', JSON.stringify(tree, null, 2))

  for (const { treeId, file, path } of files.values()) {
    const upstream = await openMedia(treeId, file)
    // A file that has gone missing simply stays out; its link then points nowhere
    if (!upstream.ok || !upstream.body) continue
    const entry = new ZipPassThrough(path)
    zip.add(entry)
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      entry.push(chunk)
      await pending
    }
    entry.push(new Uint8Array(0), true)
  }
  zip.end()
}

// ── Import ───────────────────────────────────────────────────────────────────

export class ImportError extends Error {
  constructor(
    readonly code: 'unreadable' | 'too large' | 'invalid tree',
    readonly detail?: string,
  ) {
    super(code)
  }

  toJSON() {
    return { error: this.code, detail: this.detail }
  }
}

type Unpacked = { tree: unknown; files: Map<string, Uint8Array> }

/** File name without the prefixes exports and uploads add, so names do not grow with every round trip */
const originalName = (name: string) => name.replace(/^[0-9a-f]{8}-/, '').replace(/^[0-9a-f-]{36}-/, '')

/** Reads the uploaded file (form field "file") and the other form fields of an import request */
export function readImportRequest(req: IncomingMessage): Promise<{ data: Uint8Array; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFiles: 1, maxFileSize: IMPORT_LIMITS.archiveBytes, maxFields: 10 })
    form.parse(req, async (err, fields, files) => {
      if (err) return reject(new ImportError(err.httpCode === 413 ? 'too large' : 'unreadable'))
      const raw = (files as Record<string, File | File[] | undefined>).file
      const file = Array.isArray(raw) ? raw[0] : raw
      if (!file) return reject(new ImportError('unreadable', 'no file'))
      try {
        const data = new Uint8Array(await fs.promises.readFile(file.filepath))
        const flat = Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : (v ?? ''))]),
        )
        resolve({ data, fields: flat })
      } catch (readError) {
        reject(readError)
      } finally {
        await fs.promises.unlink(file.filepath).catch(() => {})
      }
    })
  })
}

const isZip = (data: Uint8Array) => data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04

/** Reads an uploaded export (ZIP) or tree JSON, within the limits */
export function unpackImport(data: Uint8Array): Unpacked {
  if (data.length > IMPORT_LIMITS.archiveBytes) throw new ImportError('too large')
  if (!isZip(data)) {
    try {
      return { tree: JSON.parse(strFromU8(data)), files: new Map() }
    } catch {
      throw new ImportError('unreadable')
    }
  }

  let count = 0
  let unpacked = 0
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data, {
      // Decides before unpacking, from the sizes in the archive's directory
      filter: (file) => {
        const wanted = file.name === 'tree.json' || (file.name.startsWith('media/') && !!typeFromName(file.name))
        if (!wanted) return false
        count += 1
        unpacked += file.originalSize
        if (count > IMPORT_LIMITS.files || file.originalSize > IMPORT_LIMITS.fileBytes)
          throw new ImportError('too large')
        if (unpacked > IMPORT_LIMITS.unpackedBytes) throw new ImportError('too large')
        return true
      },
    })
  } catch (err) {
    if (err instanceof ImportError) throw err
    throw new ImportError('unreadable')
  }
  if (!entries['tree.json']) throw new ImportError('unreadable', 'tree.json missing')

  let tree: unknown
  try {
    tree = JSON.parse(strFromU8(entries['tree.json']))
  } catch {
    throw new ImportError('unreadable', 'tree.json is not JSON')
  }
  const files = new Map<string, Uint8Array>()
  for (const [name, content] of Object.entries(entries)) {
    // The directory size is only a promise; the real size counts
    if (content.length > IMPORT_LIMITS.fileBytes) throw new ImportError('too large')
    if (name !== 'tree.json') files.set(name, content)
  }
  return { tree, files }
}

/**
 * Validates the tree and brings its files into the target tree: files from the
 * archive are stored there, files of other trees on this server are copied if the
 * user may see them, other links to uploads are dropped. Web addresses stay.
 * Returns the tree ready to save. The links of stored files are added to `stored`
 * as they are created, so the caller can remove them if anything fails later.
 */
export async function prepareImport(
  unpacked: Unpacked,
  targetTreeId: string,
  mayRead: (treeId: string) => Promise<boolean>,
  stored: string[],
): Promise<StoredTree> {
  const checked = validateStoredTree(unpacked.tree, { archiveLinks: true })
  if (!checked.ok) throw new ImportError('invalid tree', checked.error)

  const mapped = new Map<string, string | null>()
  for (const url of mediaUrls(checked.tree)) {
    mapped.set(url, await bringOver(url))
  }
  const tree = mapMediaUrls(checked.tree, (url) => mapped.get(url) ?? null)
  // Archive links that had no file are gone now; the result must pass like any save
  const final = validateStoredTree(tree)
  if (!final.ok) throw new ImportError('invalid tree', final.error)
  return final.tree

  async function bringOver(url: string): Promise<string | null> {
    if (/^https?:\/\//i.test(url)) return url
    const archived = unpacked.files.get(url)
    if (archived) {
      const link = await storeMedia(
        targetTreeId,
        originalName(url.slice('media/'.length)),
        archived,
        typeFromName(url)!,
      )
      stored.push(link)
      return link
    }
    const ref = parseMediaUrl(url)
    if (!ref) return null
    if (ref.treeId === targetTreeId) return url
    if (!(await mayRead(ref.treeId))) return null
    const source = await openMedia(ref.treeId, ref.file)
    const type = typeFromName(ref.file)
    if (!source.ok || !type) return null
    const body = new Uint8Array(await source.arrayBuffer())
    const link = await storeMedia(targetTreeId, originalName(ref.file), body, type)
    stored.push(link)
    return link
  }
}
