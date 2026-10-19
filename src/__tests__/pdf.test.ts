/**
 * @jest-environment node
 */
// PDF-Export: Datei in genau der gewählten Größe, eine Seite, ohne Fehler.
import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { buildPdf } from '@/components/print/pdf'
import type { TreeLayout } from '@/family/layout/types'
import type { Tree } from '@/family/model'

const person = (id: string, name: string, gender: 'MALE' | 'FEMALE', extra = {}) => ({
  id,
  name,
  gender,
  spouseId: null,
  parentIds: [],
  childrenIds: [],
  profile: { birthDate: '1888', deceased: true, country: 'Frankreich', ...extra },
})

const tree: Tree = {
  version: 3,
  rootId: 'a',
  members: {
    a: { ...person('a', 'Dominique Dollibois', 'MALE'), spouseId: 'b', childrenIds: ['c'] },
    b: { ...person('b', 'Catherine Paul', 'FEMALE'), spouseId: 'a', childrenIds: ['c'] },
    c: { ...person('c', 'Christoph Dolibois', 'MALE', { country: 'USA' }), parentIds: ['a', 'b'] },
  },
}

const layout: TreeLayout = {
  width: 400,
  height: 200,
  cards: [
    { id: 'a', x: 0, y: 0, w: 184, h: 68 },
    { id: 'b', x: 214, y: 0, w: 184, h: 68 },
    { id: 'c', x: 107, y: 130, w: 184, h: 68 },
  ],
  marriages: [{ id: 'm', a: 'a', b: 'b', from: { x: 184, y: 34 }, to: { x: 214, y: 34 } }],
  connectors: [
    {
      id: 'k',
      parents: ['a', 'b'],
      child: 'c',
      points: [
        { x: 199, y: 34 },
        { x: 199, y: 100 },
        { x: 199, y: 130 },
      ],
      adopted: true,
    },
  ],
}

const loadFont = async (file: string) => {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public/fonts', file))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

const geo = (w: number, h: number) => {
  const k = Math.min(w, h) / 210
  return { w, h, k, margin: 9 * k, border: 0.45 * k, pad: 5 * k, header: 25 * k, footer: 6 * k }
}

describe('PDF-Export', () => {
  it.each([
    ['A4 hoch', 210, 297],
    ['A3 quer', 420, 297],
    ['A1 hoch', 594, 841],
  ])('%s: eine Seite in genau dieser Größe', async (_label, w, h) => {
    const bytes = await buildPdf({
      geo: geo(w, h),
      layout,
      scale: 1,
      tree,
      highlight: new Set(['a', 'c']),
      heading: {
        kicker: 'Stammbaum Dolibois',
        title: 'Ahnentafel von Christoph Dolibois',
        lines: ['Vorfahren: alle 1 Generation, Nachkommen: keine, ohne Seitenlinien. 3 Personen in 2 Generationen.'],
        legendLine: 'direkte Linie',
      },
      footer: { married: 'verheiratet', adopted: 'adoptiert', date: 'Stand: 19. Oktober 2026' },
      lang: 'de',
      title: 'Ahnentafel',
      loadFont,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo((w * 72) / 25.4, 1)
    expect(height).toBeCloseTo((h * 72) / 25.4, 1)
    expect(doc.getTitle()).toBe('Ahnentafel')
  })
})
