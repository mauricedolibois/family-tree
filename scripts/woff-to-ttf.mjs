// scripts/woff-to-ttf.mjs
// Wandelt die WOFF-Schriften aus @fontsource in TTF um, damit der PDF-Export
// sie einbetten kann (PDF kennt kein WOFF). Einmal ausführen, Ergebnis liegt in public/fonts.
//
//   node scripts/woff-to-ttf.mjs

import fs from 'fs'
import zlib from 'zlib'
import path from 'path'

const FONTS = {
  'EBGaramond-Regular.ttf': '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff',
  'EBGaramond-Italic.ttf': '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff',
  'EBGaramond-SemiBold.ttf': '@fontsource/eb-garamond/files/eb-garamond-latin-600-normal.woff',
  'IMFellEnglish-Regular.ttf': '@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff',
}

function woffToSfnt(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('kein WOFF')
  const flavor = woff.readUInt32BE(4)
  const numTables = woff.readUInt16BE(12)
  const tables = []
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20
    const tag = woff.readUInt32BE(o)
    const offset = woff.readUInt32BE(o + 4)
    const compLength = woff.readUInt32BE(o + 8)
    const origLength = woff.readUInt32BE(o + 12)
    const checksum = woff.readUInt32BE(o + 16)
    const raw = woff.subarray(offset, offset + compLength)
    const data = compLength < origLength ? zlib.inflateSync(raw) : Buffer.from(raw)
    if (data.length !== origLength) throw new Error('Tabelle beschädigt')
    tables.push({ tag, checksum, data })
  }
  let entrySelector = 0
  while (2 ** (entrySelector + 1) <= numTables) entrySelector++
  const searchRange = 2 ** entrySelector * 16
  const headerSize = 12 + numTables * 16
  const pad4 = (n) => (n + 3) & ~3
  const total = headerSize + tables.reduce((s, t) => s + pad4(t.data.length), 0)
  const out = Buffer.alloc(total)
  out.writeUInt32BE(flavor, 0)
  out.writeUInt16BE(numTables, 4)
  out.writeUInt16BE(searchRange, 6)
  out.writeUInt16BE(entrySelector, 8)
  out.writeUInt16BE(numTables * 16 - searchRange, 10)
  let offset = headerSize
  tables
    .sort((a, b) => a.tag - b.tag)
    .forEach((t, i) => {
      const o = 12 + i * 16
      out.writeUInt32BE(t.tag, o)
      out.writeUInt32BE(t.checksum, o + 4)
      out.writeUInt32BE(offset, o + 8)
      out.writeUInt32BE(t.data.length, o + 12)
      t.data.copy(out, offset)
      offset += pad4(t.data.length)
    })
  return out
}

const dir = path.join(process.cwd(), 'public/fonts')
fs.mkdirSync(dir, { recursive: true })
for (const [name, src] of Object.entries(FONTS)) {
  const ttf = woffToSfnt(fs.readFileSync(path.join(process.cwd(), 'node_modules', src)))
  fs.writeFileSync(path.join(dir, name), ttf)
  console.log(name, ttf.length)
}
