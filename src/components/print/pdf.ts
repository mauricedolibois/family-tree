// src/components/print/pdf.ts
//
// Das Druckblatt als echte PDF-Datei, direkt im Browser erzeugt: genau in der
// gewählten Papiergröße, mit eingebetteten Schriften und als Vektorgrafik.
// Der Druckdialog hält sich nicht überall an die Seitengröße (Safari auf dem
// iPhone druckt z. B. auf A4 hoch und verkleinert oder bricht um) – die Datei
// sieht dagegen überall gleich aus. Zeichnet dasselbe wie <Sheet> in ExportSheet.

import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  StandardFonts,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setLineJoin,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Tree, Person } from '@/family/model'
import type { TreeLayout, CardBox } from '@/family/layout/types'
import { initials, isDeceased, lifeYears, splitName } from '@/family/format'
import { roundedPath } from '@/components/tree/Connectors'
import { flagOf } from '@/components/ui/CountryFlag'
import type { Lang } from '@/i18n/lang'

export type SheetGeometry = {
  w: number
  h: number
  k: number
  margin: number
  border: number
  pad: number
  header: number
  footer: number
}

export type PdfInput = {
  geo: SheetGeometry
  layout: TreeLayout
  /** Baum-Pixel → CSS-Pixel, wie in der Vorschau */
  scale: number
  tree: Tree
  highlight: Set<string> | null
  heading: { kicker: string; title: string; lines: string[]; legendLine: string | null }
  footer: { married: string; adopted: string; date: string }
  lang: Lang
  title: string
  /** Schriftdatei laden (Standard: aus /public/fonts); für Tests austauschbar */
  loadFont?: (file: string) => Promise<ArrayBuffer>
}

const fetchFont = async (file: string) => {
  const res = await fetch(`/fonts/${file}`)
  if (!res.ok) throw new Error(`Schrift ${file} fehlt`)
  return res.arrayBuffer()
}

// ── Maße und Farben ──────────────────────────────────────────────────────────

const MM = 72 / 25.4 // pt je mm
const PX = 0.75 // pt je CSS-Pixel

const c255 = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255)
const INK = c255(43, 30, 20)
const INK_MUTED = c255(105, 86, 66)
const INK_FAINT = c255(138, 119, 96)
const LINE = c255(128, 102, 66)
const GILT = c255(186, 142, 52)
const GILT_DEEP = c255(118, 84, 22)
const CARD = c255(250, 244, 228)
const CARD_PAST = c255(240, 231, 208)
const CARD_EDGE = c255(233, 218, 184)
const CARD_RULE = c255(196, 172, 128)
const PORTRAIT = c255(226, 210, 174)
const LINEN = c255(30, 52, 40)
const WHITE = rgb(1, 1, 1)

const hex = (h: string): Color => {
  const n = parseInt(h.slice(1), 16)
  return c255((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

// ── Schriften ────────────────────────────────────────────────────────────────

type Fonts = {
  serif: PDFFont
  serifBold: PDFFont
  serifItalic: PDFFont
  display: PDFFont
  /** für Zeichen, die in den Schriften fehlen (z. B. †) */
  fallback: PDFFont
  fallbackItalic: PDFFont
  fallbackBold: PDFFont
}

async function loadFonts(doc: PDFDocument, load: (file: string) => Promise<ArrayBuffer>): Promise<Fonts> {
  doc.registerFontkit(fontkit)
  const get = async (file: string) => doc.embedFont(await load(file), { subset: true })
  const [serif, serifBold, serifItalic, display] = await Promise.all([
    get('EBGaramond-Regular.ttf'),
    get('EBGaramond-SemiBold.ttf'),
    get('EBGaramond-Italic.ttf'),
    get('IMFellEnglish-Regular.ttf'),
  ])
  return {
    serif,
    serifBold,
    serifItalic,
    display,
    fallback: await doc.embedFont(StandardFonts.TimesRoman),
    fallbackItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    fallbackBold: await doc.embedFont(StandardFonts.TimesRomanBold),
  }
}

/**
 * Ober- und Unterlänge (Anteil der Schriftgröße) aus der hhea-Tabelle, wie sie
 * Browser für die Zeilenhöhe nehmen; pdf-lib rechnet bei IM Fell daneben.
 */
const METRICS = new Map<string, { ascent: number; descent: number }>([
  ['EBGaramond', { ascent: 1.007, descent: 0.298 }],
  ['IM_FELL', { ascent: 1854 / 2048, descent: 744 / 2048 }],
])

function metricsOf(font: PDFFont) {
  const name = font.name
  for (const [prefix, m] of METRICS) if (name.startsWith(prefix)) return m
  return { ascent: 0.9, descent: 0.25 }
}

/** Text in Abschnitte aufteilen: was die Schrift kann, und den Rest in der Ersatzschrift */
class TextStyle {
  private has: Set<number>
  private hasFallback: Set<number>
  constructor(
    readonly font: PDFFont,
    readonly fallback: PDFFont,
    readonly size: number,
    readonly color: Color,
    readonly spacing = 0,
  ) {
    this.has = new Set(font.getCharacterSet())
    this.hasFallback = new Set(fallback.getCharacterSet())
  }

  runs(text: string): Array<{ text: string; font: PDFFont }> {
    const out: Array<{ text: string; font: PDFFont }> = []
    for (const ch of text) {
      const cp = ch.codePointAt(0)!
      const [font, c] = this.has.has(cp)
        ? [this.font, ch]
        : this.hasFallback.has(cp)
        ? [this.fallback, ch]
        : [this.font, this.has.has(63) ? '?' : '']
      const last = out[out.length - 1]
      if (last && last.font === font) last.text += c
      else out.push({ text: c, font })
    }
    return out
  }

  width(text: string): number {
    const chars = [...text].length
    return (
      this.runs(text).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, this.size), 0) +
      this.spacing * Math.max(0, chars - 1)
    )
  }

  /** Abstand von der Oberkante einer Zeile der Höhe `lineHeight` zur Grundlinie (wie im Browser) */
  baseline(lineHeight: number): number {
    const m = metricsOf(this.font)
    const ascent = m.ascent * this.size
    const full = (m.ascent + m.descent) * this.size
    return (lineHeight - full) / 2 + ascent
  }

  /** Auf Breite kürzen, mit … am Ende */
  fit(text: string, max: number): string {
    if (this.width(text) <= max) return text
    const chars = [...text]
    while (chars.length && this.width(chars.join('') + '…') > max) chars.pop()
    return chars.join('').trimEnd() + '…'
  }

  /** Zeilenumbruch an Wortgrenzen */
  wrap(text: string, max: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (line && this.width(next) > max) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
    return lines
  }
}

// ── Zeichnen ─────────────────────────────────────────────────────────────────

/** Seite mit Koordinaten von oben links in pt */
class Canvas {
  constructor(
    readonly page: PDFPage,
    readonly H: number,
  ) {}

  text(s: string, x: number, baselineTop: number, style: TextStyle, opacity = 1) {
    if (style.spacing) this.page.pushOperators(setCharacterSpacing(style.spacing))
    let cx = x
    for (const run of style.runs(s)) {
      if (!run.text) continue
      this.page.drawText(run.text, {
        x: cx,
        y: this.H - baselineTop,
        size: style.size,
        font: run.font,
        color: style.color,
        opacity,
      })
      cx += run.font.widthOfTextAtSize(run.text, style.size) + style.spacing * [...run.text].length
    }
    if (style.spacing) this.page.pushOperators(setCharacterSpacing(0))
  }

  centered(s: string, cx: number, baselineTop: number, style: TextStyle) {
    this.text(s, cx - style.width(s) / 2, baselineTop, style)
  }

  /** SVG-Pfad mit Ursprung (ox, oy) oben links und Maßstab `s` */
  path(
    d: string,
    ox: number,
    oy: number,
    s: number,
    o: {
      fill?: Color
      stroke?: Color
      width?: number
      opacity?: number
      strokeOpacity?: number
      dash?: number[]
      round?: boolean
    },
  ) {
    this.page.drawSvgPath(d, {
      x: ox,
      y: this.H - oy,
      scale: s,
      color: o.fill,
      borderColor: o.stroke,
      borderWidth: o.stroke ? o.width ?? 1 : undefined,
      opacity: o.opacity,
      borderOpacity: o.strokeOpacity ?? o.opacity,
      borderDashArray: o.dash,
      borderLineCap: o.round ? LineCapStyle.Round : undefined,
    })
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    o: { fill?: Color; stroke?: Color; width?: number; opacity?: number },
  ) {
    this.page.drawRectangle({
      x,
      y: this.H - y - h,
      width: w,
      height: h,
      color: o.fill,
      borderColor: o.stroke,
      borderWidth: o.stroke ? o.width ?? 1 : 0,
      opacity: o.opacity,
      borderOpacity: o.opacity,
    })
  }
}

/** Abgerundetes Rechteck als SVG-Pfad */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ')
}

function circlePath(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r
  return [
    `M ${cx + r} ${cy}`,
    `C ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r}`,
    `C ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy}`,
    `C ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r}`,
    `C ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy}`,
    'Z',
  ].join(' ')
}

/** Ausschneidepfad (in pt, PDF-Koordinaten) für Kreis oder abgerundetes Quadrat */
function clipOps(x: number, y: number, size: number, round: boolean, r: number): PDFOperator[] {
  if (round) {
    const cx = x + size / 2
    const cy = y + size / 2
    const rr = size / 2
    const k = 0.5523 * rr
    return [
      moveTo(cx + rr, cy),
      appendBezierCurve(cx + rr, cy + k, cx + k, cy + rr, cx, cy + rr),
      appendBezierCurve(cx - k, cy + rr, cx - rr, cy + k, cx - rr, cy),
      appendBezierCurve(cx - rr, cy - k, cx - k, cy - rr, cx, cy - rr),
      appendBezierCurve(cx + k, cy - rr, cx + rr, cy - k, cx + rr, cy),
      closePath(),
      clip(),
      endPath(),
    ]
  }
  const k = 0.5523 * r
  return [
    moveTo(x + r, y),
    lineTo(x + size - r, y),
    appendBezierCurve(x + size - r + k, y, x + size, y + r - k, x + size, y + r),
    lineTo(x + size, y + size - r),
    appendBezierCurve(x + size, y + size - r + k, x + size - r + k, y + size, x + size - r, y + size),
    lineTo(x + r, y + size),
    appendBezierCurve(x + r - k, y + size, x, y + size - r + k, x, y + size - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
    clip(),
    endPath(),
  ]
}

// ── Fotos ────────────────────────────────────────────────────────────────────

const PHOTO_PX = 240

/** Foto laden, quadratisch zuschneiden, verkleinern, bei Verstorbenen leicht entsättigen */
async function loadPortrait(url: string, faded: boolean): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const bitmap = await createImageBitmap(await res.blob())
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(PHOTO_PX, side)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    if (faded) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const grey = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        d[i] += (grey - d[i]) * 0.35
        d[i + 1] += (grey - d[i + 1]) * 0.35
        d[i + 2] += (grey - d[i + 2]) * 0.35
      }
      ctx.putImageData(img, 0, 0)
    }
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

async function loadPortraits(doc: PDFDocument, people: Person[]): Promise<Map<string, PDFImage>> {
  const out = new Map<string, PDFImage>()
  const queue = people.filter((p) => p.profile?.titleImageUrl)
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const bytes = await loadPortrait(p.profile!.titleImageUrl!, isDeceased(p))
      if (bytes) out.set(p.id, await doc.embedJpg(bytes))
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return out
}

// ── Das Blatt ────────────────────────────────────────────────────────────────

export async function buildPdf(input: PdfInput): Promise<Uint8Array> {
  const { geo, layout, tree, highlight, heading, footer, lang } = input
  const doc = await PDFDocument.create()
  doc.setTitle(input.title)
  doc.setCreator('Stammbaum')
  doc.setLanguage(lang === 'en' ? 'en-US' : 'de-DE')
  const fonts = await loadFonts(doc, input.loadFont ?? fetchFont)

  const W = geo.w * MM
  const H = geo.h * MM
  const page = doc.addPage([W, H])
  page.pushOperators(setLineJoin(LineJoinStyle.Round))
  const cv = new Canvas(page, H)
  const k = geo.k
  const fs = 3.3 * k * MM // Grundschrift des Blatts

  // Doppelter Goldrahmen
  const m = geo.margin * MM
  const bw = geo.border * MM
  cv.rect(m + bw / 2, m + bw / 2, W - 2 * m - bw, H - 2 * m - bw, { stroke: GILT, width: bw })
  const innerW = 0.18 * k * MM
  const inset = m + bw + 1.3 * k * MM + innerW / 2
  cv.rect(inset, inset, W - 2 * inset, H - 2 * inset, { stroke: GILT, width: innerW, opacity: 0.65 })

  const box = { x: m + bw + geo.pad * MM, y: m + bw + geo.pad * MM }
  const cw = W - 2 * box.x
  const cx = W / 2

  // Kopf: Überschrift, Zierlinie, Beschreibung
  let y = box.y
  const kicker = new TextStyle(fonts.serifItalic, fonts.fallbackItalic, 0.95 * fs, INK_MUTED)
  cv.centered(heading.kicker, cx, y + kicker.baseline(kicker.size * 1.5), kicker)
  y += kicker.size * 1.5
  const title = new TextStyle(fonts.display, fonts.fallback, 2.15 * fs, INK)
  y += 0.1 * title.size
  for (const line of title.wrap(heading.title, cw)) {
    cv.centered(line, cx, y + title.baseline(title.size * 1.1), title)
    y += title.size * 1.1
  }
  y += 0.35 * fs
  const fw = 58 * k * MM
  drawFlourish(cv, cx - fw / 2, y, fw / 240)
  y += 3.6 * k * MM + 0.35 * fs
  const desc = new TextStyle(fonts.serif, fonts.fallback, 0.9 * fs, INK_MUTED)
  for (const para of heading.lines) {
    for (const line of desc.wrap(para, cw * 0.85)) {
      cv.centered(line, cx, y + desc.baseline(desc.size * 1.375), desc)
      y += desc.size * 1.375
    }
  }

  // Baum, mittig im freien Feld
  const area = {
    x: box.x,
    y: box.y + geo.header * MM,
    w: cw,
    h: H - 2 * box.y - geo.header * MM - geo.footer * MM,
  }
  const s = Math.min(input.scale * PX, area.w / layout.width, area.h / layout.height)
  const ox = area.x + (area.w - layout.width * s) / 2
  const oy = area.y + (area.h - layout.height * s) / 2
  const portraits = await loadPortraits(
    doc,
    layout.cards.map((c) => tree.members[c.id]).filter((p): p is Person => !!p),
  )
  drawConnectors(cv, layout, highlight, ox, oy, s)
  const styles = cardStyles(fonts, s)
  for (const card of layout.cards) {
    const person = tree.members[card.id]
    if (person) drawCard(cv, card, person, !!highlight?.has(card.id), portraits.get(card.id), ox, oy, s, styles, lang)
  }

  // Fuß: Legende links, Datum rechts
  const foot = new TextStyle(fonts.serif, fonts.fallback, 0.8 * fs, INK_MUTED)
  const lh = foot.size * 1.5
  const top = H - box.y - lh
  const base = top + foot.baseline(lh)
  const em = foot.size
  let fx = box.x
  // ⚭
  const ringW = 1.3 * em
  const ringS = ringW / 16
  const ringTop = top + (lh - 0.85 * em) / 2
  for (const rcx of [5.6, 10.4]) {
    cv.path(circlePath(rcx, 5, 3.6), fx, ringTop, ringS, { stroke: INK_MUTED, width: 1.2 })
  }
  fx += ringW + 0.4 * em
  cv.text(footer.married, fx, base, foot)
  fx += foot.width(footer.married) + 1.4 * em
  if (heading.legendLine) {
    cv.rect(fx, top + lh / 2 - 0.09 * em, 1.8 * em, 0.18 * em, { fill: GILT })
    fx += 1.8 * em + 0.4 * em
    cv.text(heading.legendLine, fx, base, foot)
    fx += foot.width(heading.legendLine) + 1.4 * em
  }
  if (layout.connectors.some((c) => c.adopted)) {
    cv.path(`M 0 0 H ${1.8 * em}`, fx, top + lh / 2, 1, {
      stroke: LINE,
      width: 0.12 * em,
      dash: [0.36 * em, 0.24 * em],
    })
    fx += 1.8 * em + 0.4 * em
    cv.text(footer.adopted, fx, base, foot)
  }
  cv.text(footer.date, W - box.x - foot.width(footer.date), base, foot)

  return doc.save()
}

/** Zierlinie wie <Flourish>, Breite 240 Einheiten × Maßstab */
function drawFlourish(cv: Canvas, x: number, y: number, s: number) {
  const o = { stroke: GILT, width: 1, round: true }
  cv.path('M 4 8 H 92', x, y, s, { ...o, strokeOpacity: 0.55 })
  cv.path('M 148 8 H 236', x, y, s, { ...o, strokeOpacity: 0.55 })
  cv.path('M 92 8 C 100 8 102 2 108 4 C 112 5.5 110 10 106 9', x, y, s, o)
  cv.path('M 148 8 C 140 8 138 14 132 12 C 128 10.5 130 6 134 7', x, y, s, o)
  cv.path('M 120 2 L 126 8 L 120 14 L 114 8 Z', x, y, s, { fill: GILT })
  cv.path(circlePath(104, 8, 1.2), x, y, s, { fill: GILT })
  cv.path(circlePath(136, 8, 1.2), x, y, s, { fill: GILT })
}

/** Linien wie <Connectors still>: Sepiatinte, Ehen mit ⚭, Gold für die Linie */
function drawConnectors(
  cv: Canvas,
  layout: TreeLayout,
  lineage: Set<string> | null,
  ox: number,
  oy: number,
  s: number,
) {
  const inLine = (child: string, parents: string[]) =>
    !!lineage && lineage.has(child) && parents.some((p) => lineage.has(p))
  for (const c of layout.connectors) {
    const d = roundedPath(c.points)
    const dash = c.adopted ? [5, 6] : undefined
    cv.path(d, ox, oy, s, { stroke: LINE, width: 3.4, strokeOpacity: 0.16, dash, round: true })
    cv.path(d, ox, oy, s, { stroke: LINE, width: 1.4, dash, round: true })
  }
  for (const mline of layout.marriages) {
    const gold = !!lineage && lineage.has(mline.a) && lineage.has(mline.b)
    const color = gold ? GILT : LINE
    for (const dy of [-2, 2]) {
      cv.path(`M ${mline.from.x} ${mline.from.y + dy} L ${mline.to.x} ${mline.to.y + dy}`, ox, oy, s, {
        stroke: color,
        width: 1.2,
      })
    }
    const mx = (mline.from.x + mline.to.x) / 2
    cv.path(circlePath(mx, mline.from.y, 10), ox, oy, s, {
      fill: CARD,
      stroke: gold ? GILT : CARD_RULE,
      width: 1,
    })
    for (const rx of [mx - 2.6, mx + 2.6]) {
      cv.path(circlePath(rx, mline.from.y, 3.6), ox, oy, s, { stroke: gold ? GILT_DEEP : INK_MUTED, width: 1.3 })
    }
  }
  if (lineage) {
    for (const c of layout.connectors) {
      if (inLine(c.child, c.parents)) {
        cv.path(roundedPath(c.points), ox, oy, s, { stroke: GILT, width: 2.2, round: true })
      }
    }
  }
}

type CardStyles = ReturnType<typeof cardStyles>

function cardStyles(f: Fonts, s: number) {
  // Größen in Baum-Pixeln × s = pt
  return {
    given: new TextStyle(f.serifBold, f.fallbackBold, 16.5 * s, INK),
    surname: new TextStyle(f.serif, f.fallback, 14 * 0.74 * s, INK_MUTED, 14 * 0.06 * s),
    years: new TextStyle(f.serif, f.fallback, 13.5 * s, INK_FAINT),
    initials: new TextStyle(f.display, f.fallback, 14 * s, LINEN),
  }
}

/** Eine Karte wie <PersonCard>: Exlibris mit Goldecken, Medaillon, Name, Nachname, Flagge und Jahre */
function drawCard(
  cv: Canvas,
  box: CardBox,
  person: Person,
  inLine: boolean,
  photo: PDFImage | undefined,
  ox: number,
  oy: number,
  s: number,
  st: CardStyles,
  lang: Lang,
) {
  const { x, y, w, h } = box
  const P = (px: number) => ox + px * s
  const Q = (py: number) => oy + py * s

  // Karte
  cv.path(roundRect(x, y, w, h, 12), ox, oy, s, { fill: isDeceased(person) ? CARD_PAST : CARD })
  cv.path(roundRect(x + 2, y + 2, w - 4, h - 4, 10), ox, oy, s, { stroke: CARD_EDGE, width: 3, strokeOpacity: 0.55 })
  cv.path(roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 11.5), ox, oy, s, {
    stroke: inLine ? GILT : CARD_RULE,
    width: 1,
    strokeOpacity: inLine ? 0.8 : 1,
  })
  cv.path(roundRect(x + 4.5, y + 4.5, w - 9, h - 9, 8.5), ox, oy, s, {
    stroke: inLine ? GILT : CARD_RULE,
    width: 1,
    strokeOpacity: inLine ? 0.55 : 0.75,
  })
  // Goldene Eckwinkel
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    const hx = dx > 0 ? cx : cx - 9
    const vy = dy > 0 ? cy : cy - 9
    cv.path(`M ${hx} ${dy > 0 ? cy : cy - 1.5} h 9 v 1.5 h -9 Z`, ox, oy, s, { fill: GILT, opacity: 0.85 })
    cv.path(`M ${dx > 0 ? cx : cx - 1.5} ${vy} h 1.5 v 9 h -1.5 Z`, ox, oy, s, { fill: GILT, opacity: 0.85 })
  }
  corner(x + 7, y + 7, 1, 1)
  corner(x + w - 7, y + 7, -1, 1)
  corner(x + 7, y + h - 7, 1, -1)
  corner(x + w - 7, y + h - 7, -1, -1)

  // Medaillon: Männer eckig, Frauen rund
  const size = 44
  const px = x + 11
  const py = y + (h - size) / 2
  const round = person.gender === 'FEMALE'
  const shape = round ? circlePath(px + size / 2, py + size / 2, size / 2) : roundRect(px, py, size, size, 7)
  cv.path(shape, ox, oy, s, { fill: PORTRAIT })
  if (photo) {
    const page = cv.page
    const X = P(px)
    const Y = cv.H - Q(py + size)
    page.pushOperators(pushGraphicsState(), ...clipOps(X, Y, size * s, round, 7 * s))
    page.drawImage(photo, { x: X, y: Y, width: size * s, height: size * s })
    page.pushOperators(popGraphicsState())
  } else {
    const text = initials(person.name)
    const lh = size
    cv.text(text, P(px + size / 2) - st.initials.width(text) / 2, Q(py) + st.initials.baseline(lh * s), st.initials)
  }
  const ring = (offset: number, width: number, opacity: number) => {
    const d = round
      ? circlePath(px + size / 2, py + size / 2, size / 2 + offset)
      : roundRect(px - offset, py - offset, size + 2 * offset, size + 2 * offset, 7 + offset)
    cv.path(d, ox, oy, s, { stroke: GILT, width, strokeOpacity: opacity })
  }
  ring(2, 1, 0.8)
  ring(4.375, 0.75, 0.45)

  // Text
  const tx = x + 1 + 10 + size + 12
  const maxW = (x + w - 11 - tx) * s
  const { given, surname } = splitName(person.name)
  const first = given || surname
  const second = given && surname ? surname.toUpperCase() : ''
  const years = lifeYears(person, lang)
  const flag = person.profile?.country ? flagOf(person.profile.country.trim()) : null
  const L1 = 16.5 * 1.25
  const L2 = second ? 14 * 1.25 : 0
  const L3 = years || flag ? 1 + 13.5 * 1.25 : 1
  let ty = y + (h - (L1 + L2 + L3)) / 2

  cv.text(st.given.fit(first, maxW), P(tx), Q(ty) + st.given.baseline(L1 * s), st.given)
  ty += L1
  if (second) {
    cv.text(st.surname.fit(second, maxW), P(tx), Q(ty) + st.surname.baseline(L2 * s), st.surname)
    ty += L2
  }
  ty += 1
  let rx = tx
  const row = 13.5 * 1.25
  if (flag) {
    drawFlag(cv, flag, P(rx), Q(ty + (row - 12) / 2), 16 * s, 12 * s)
    rx += 16 + 6
  }
  if (years) cv.text(st.years.fit(years, (x + w - 11 - rx) * s), P(rx), Q(ty) + st.years.baseline(row * s), st.years)
}

/** Flagge wie <CountryFlag>, Breite × Höhe in pt */
function drawFlag(
  cv: Canvas,
  flag: NonNullable<ReturnType<typeof flagOf>>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if ('special' in flag && flag.special === 'usa') {
    const stripe = h / 13
    for (let i = 0; i < 13; i++) cv.rect(x, y + i * stripe, w, stripe, { fill: i % 2 ? WHITE : hex('#B22234') })
    cv.rect(x, y, w * 0.42, h * 0.54, { fill: hex('#3C3B6E') })
  } else if ('special' in flag && flag.special === 'swiss') {
    cv.rect(x, y, w, h, { fill: hex('#DA291C') })
    cv.rect(x + w * 0.41, y + h * 0.2, w * 0.18, h * 0.6, { fill: WHITE })
    cv.rect(x + w * 0.26, y + h * 0.39, w * 0.48, h * 0.22, { fill: WHITE })
  } else if ('stripes' in flag) {
    const n = flag.stripes.length
    flag.stripes.forEach((c, i) => {
      if (flag.dir === 'row') cv.rect(x + (i * w) / n, y, w / n, h, { fill: hex(c) })
      else cv.rect(x, y + (i * h) / n, w, h / n, { fill: hex(c) })
    })
  }
  cv.rect(x, y, w, h, { stroke: INK, width: 0.5, opacity: 0.15 })
}
