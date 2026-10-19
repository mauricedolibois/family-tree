// src/components/print/ExportSheet.tsx
//
// PDF-Export: Linie, Beziehung oder ganze Familie als Blatt in A4 bis A1,
// hoch oder quer. Gedruckt bzw. als PDF gesichert wird über den Druckdialog
// des Browsers – so bleibt alles gestochen scharf (Vektoren, echte Schriften).

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { lineageOf, lineageView, lineDepth, subTree, type Tree } from '@/family/model'
import { findConnection } from '@/family/kinship'
import { describeLineScope, splitName } from '@/family/format'
import type { TreeLayout } from '@/family/layout/types'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useTreeLayout } from '@/components/tree/useTreeLayout'
import { PersonCard } from '@/components/tree/PersonCard'
import { Connectors } from '@/components/tree/Connectors'
import { describeRelation } from '@/components/relation/RelationCard'
import { Segmented } from '@/components/ui/Choice'
import { Button } from '@/components/ui/Button'
import { Flourish } from '@/components/ui/Flourish'
import { locale, useLang } from '@/i18n/lang'

type Content = 'line' | 'relation' | 'all'
type Orientation = 'portrait' | 'landscape'
type Paper = 'A4' | 'A3' | 'A2' | 'A1'

/** Papiergrößen in mm, hochkant (Breite, Höhe) */
const PAPER: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] }
const PAPERS = Object.keys(PAPER) as Paper[]
const PX_PER_MM = 96 / 25.4
/** Schriftgröße der Vornamen auf den Karten (px bei Maßstab 1) */
const NAME_PX = 16.5
/** Ab dieser Größe gilt der Druck als gut lesbar */
const READABLE_PT = 6.5

/** Maße eines Blatts in mm; alles wächst mit dem Papier mit */
function sheetGeometry(paper: Paper, orientation: Orientation) {
  const [short, long] = PAPER[paper]
  const [w, h] = orientation === 'portrait' ? [short, long] : [long, short]
  const k = short / 210
  const margin = 9 * k
  const border = 0.45 * k
  const pad = 5 * k
  const header = 25 * k
  const footer = 6 * k
  return {
    w,
    h,
    k,
    margin,
    border,
    pad,
    header,
    footer,
    treeW: w - 2 * (margin + border + pad),
    treeH: h - 2 * (margin + border + pad) - header - footer,
  }
}

/** Maßstab, in dem der Baum auf das Blatt passt (Baum-Pixel → CSS-Pixel) */
function treeScale(layout: TreeLayout, paper: Paper, orientation: Orientation) {
  const g = sheetGeometry(paper, orientation)
  return Math.min((g.treeW * PX_PER_MM) / layout.width, (g.treeH * PX_PER_MM) / layout.height, 1.25 * g.k)
}

const namePt = (scale: number) => NAME_PX * scale * 0.75

function bestOrientation(layout: TreeLayout, paper: Paper): Orientation {
  return treeScale(layout, paper, 'landscape') >= treeScale(layout, paper, 'portrait') ? 'landscape' : 'portrait'
}

/** Kleinstes Papier, auf dem die Namen gut lesbar sind (sonst das größte) */
function bestPaper(layout: TreeLayout): Paper {
  return PAPERS.find((p) => namePt(treeScale(layout, p, bestOrientation(layout, p))) >= READABLE_PT) ?? 'A1'
}

export function ExportSheet() {
  const { exportOpen } = useView()
  return exportOpen ? <ExportDialog /> : null
}

function ExportDialog() {
  const { tree, index, familyName } = useFamily()
  const { setExportOpen, lineId, meId, relation, lineScope } = useView()
  const { t, lang } = useLang()
  const close = () => setExportOpen(false)

  const linePerson = lineId ?? meId
  const pairFrom = relation?.from ?? null
  const pairTo = relation?.to ?? null
  const pair = useMemo(() => (pairFrom && pairTo ? { from: pairFrom, to: pairTo } : null), [pairFrom, pairTo])
  const [content, setContent] = useState<Content>(pair ? 'relation' : linePerson ? 'line' : 'all')
  const [orientationChoice, setOrientationChoice] = useState<Orientation | null>(null)
  const [paperChoice, setPaperChoice] = useState<Paper | null>(null)

  // Was gedruckt wird: Ausschnitt, hervorgehobene Personen, Person im Mittelpunkt
  const view = useMemo(() => {
    if (content === 'line' && linePerson) {
      return {
        tree: subTree(tree, lineageView(index, linePerson, lineScope)),
        focus: linePerson,
        highlight: lineageOf(index, linePerson),
      }
    }
    if (content === 'relation' && pair) {
      const c = findConnection(index, pair.from, pair.to)
      const ids = new Set(c ? [...c.path, ...c.common] : [pair.from, pair.to])
      return { tree: subTree(tree, ids), focus: pair.from, highlight: ids }
    }
    return { tree, focus: null, highlight: null }
  }, [content, tree, index, linePerson, lineScope, pair])
  const { layout } = useTreeLayout(view.tree, view.focus)
  const heading = useHeading(content, view.tree, layout, linePerson, pair, familyName)

  const paper = paperChoice ?? (layout ? bestPaper(layout) : 'A4')
  const orientation = orientationChoice ?? (layout ? bestOrientation(layout, paper) : 'landscape')
  const geo = sheetGeometry(paper, orientation)
  const scale = layout ? treeScale(layout, paper, orientation) : 1
  const pt = namePt(scale)
  const [building, setBuilding] = useState(false)
  const [failed, setFailed] = useState(false)

  /** PDF-Datei in genau diesem Format erzeugen und herunterladen */
  const download = async () => {
    if (!layout) return
    setBuilding(true)
    setFailed(false)
    try {
      const { buildPdf } = await import('./pdf')
      const date = new Date().toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' })
      const bytes = await buildPdf({
        geo,
        layout,
        scale,
        tree: view.tree,
        highlight: view.highlight,
        heading,
        footer: {
          married: t('verheiratet', 'married'),
          adopted: t('adoptiert', 'adopted'),
          date: `${t('Stand', 'As of')}: ${date}`,
        },
        lang,
        title: heading.title,
      })
      const name = [heading.title, paper, orientation === 'portrait' ? t('hoch', 'portrait') : t('quer', 'landscape')]
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${name || 'stammbaum'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error('[PDF]', e)
      setFailed(true)
    } finally {
      setBuilding(false)
    }
  }

  // Beim Drucken immer im Tageslicht
  useEffect(() => {
    const root = document.documentElement
    const prev = root.dataset.theme
    if (prev) delete root.dataset.theme
    return () => {
      if (prev) root.dataset.theme = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExportOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setExportOpen])

  const options: Array<{ value: Content; label: string }> = []
  if (linePerson) {
    const p = index.byId.get(linePerson)
    const who = p ? splitName(p.name).given || p.name : '…'
    const label = linePerson === meId ? t('Meine Linie', 'My line') : t(`Linie von ${who}`, `Line of ${who}`)
    options.push({ value: 'line', label })
  }
  if (pair) options.push({ value: 'relation', label: t('Beziehung', 'Relationship') })
  options.push({ value: 'all', label: t('Ganze Familie', 'Whole family') })

  const chooseContent = (c: Content) => {
    setContent(c)
    setPaperChoice(null)
    setOrientationChoice(null)
  }

  return (
    <div className="desk fixed inset-0 z-[80] flex flex-col overflow-hidden bg-paper print:static print:block print:overflow-visible print:bg-none">
      <style>{`@page { size: ${geo.w}mm ${geo.h}mm; margin: 0 }`}</style>

      <header className="book-cover flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)] text-card print:hidden">
        <button
          type="button"
          onClick={close}
          className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[15px] text-card/90 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> {t('Zurück', 'Back')}
        </button>
        <h1 className="font-display text-[1.35rem] text-gilt-soft">{t('Als PDF exportieren', 'Export as PDF')}</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row md:overflow-hidden print:block print:overflow-visible">
        {/* Einstellungen */}
        <aside className="shrink-0 p-3 md:w-[380px] md:overflow-auto md:p-4 print:hidden">
          <div className="parchment flex flex-col gap-4 rounded-card border border-gilt/60 p-4 shadow-card">
            <Segmented
              dense
              label={t('Inhalt', 'Content')}
              value={content}
              options={options}
              onChange={chooseContent}
            />
            <Segmented
              label={t('Format', 'Orientation')}
              value={orientation}
              options={[
                { value: 'portrait', label: t('Hoch', 'Portrait') },
                { value: 'landscape', label: t('Quer', 'Landscape') },
              ]}
              onChange={setOrientationChoice}
            />
            <Segmented
              dense
              label={t('Papier', 'Paper')}
              value={paper}
              options={PAPERS.map((p) => ({ value: p, label: p }))}
              onChange={setPaperChoice}
            />
            <p className="text-sm leading-snug text-ink-muted" aria-live="polite">
              {layout
                ? t('Namen in etwa ', 'Names at about ') +
                  `${pt.toLocaleString(locale(lang), { maximumFractionDigits: 1 })} pt.` +
                  (pt < READABLE_PT
                    ? t(' Für gut lesbaren Druck größeres Papier wählen.', ' Choose larger paper for a readable print.')
                    : t(' Gut lesbar.', ' Easy to read.'))
                : t('Der Baum wird angeordnet …', 'Arranging the tree …')}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                className="w-full"
                icon={<Download className="h-4 w-4" />}
                onClick={download}
                disabled={!layout || building}
              >
                {building ? t('PDF wird erstellt …', 'Creating PDF …') : t('PDF herunterladen', 'Download PDF')}
              </Button>
              {failed && (
                <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                  {t(
                    'Die PDF konnte nicht erstellt werden. Versuch es noch einmal oder nutze „Drucken“.',
                    'The PDF could not be created. Try again or use “Print”.',
                  )}
                </p>
              )}
              <p className="text-sm leading-snug text-ink-faint">
                {t(
                  'Die Datei hat genau das gewählte Format – zum Ausdrucken zu Hause oder im Copyshop.',
                  'The file has exactly the chosen size – for printing at home or at a print shop.',
                )}
              </p>
              <Button
                variant="quiet"
                size="sm"
                className="self-start"
                icon={<Printer className="h-4 w-4" />}
                onClick={() => window.print()}
                disabled={!layout}
              >
                {t('Direkt drucken', 'Print directly')}
              </Button>
            </div>
          </div>
        </aside>

        {/* Vorschau – beim Drucken das Blatt selbst */}
        <Preview widthMm={geo.w} heightMm={geo.h}>
          <Sheet
            geo={geo}
            layout={layout}
            scale={scale}
            tree={view.tree}
            highlight={view.highlight}
            heading={heading}
          />
        </Preview>
      </div>
    </div>
  )
}

/** Blatt verkleinert in den verfügbaren Platz einpassen; beim Drucken in Originalgröße */
function Preview({ widthMm, heightMm, children }: { widthMm: number; heightMm: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState({ w: 360, h: 600 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSpace({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const w = widthMm * PX_PER_MM
  const h = heightMm * PX_PER_MM
  const wide = space.w >= 600
  const s = Math.min(1, (space.w - 24) / w, wide ? (space.h - 24) / h : Infinity)
  return (
    <div
      ref={box}
      className="flex min-h-0 flex-1 justify-center p-3 md:items-center md:overflow-auto print:block print:p-0"
    >
      <div style={{ width: w * s, height: h * s }} className="shrink-0 print:!h-auto print:!w-auto">
        <div style={{ transform: `scale(${s})`, transformOrigin: 'top left' }} className="print-sheet-holder">
          {children}
        </div>
      </div>
    </div>
  )
}

type Heading = { kicker: string; title: string; lines: string[]; legendLine: string | null }

function useHeading(
  content: Content,
  tree: Tree,
  layout: TreeLayout | null,
  linePerson: string | null,
  pair: { from: string; to: string } | null,
  familyName: string,
): Heading {
  const { index } = useFamily()
  const { lineScope } = useView()
  const { t, lang } = useLang()
  return useMemo(() => {
    const count = Object.keys(tree.members).length
    const generations = layout ? new Set(layout.cards.map((c) => c.y)).size : 0
    const kicker = t(`Stammbaum ${familyName}`, `${familyName} family tree`)
    const people = t(
      `${count} Personen in ${generations} Generationen.`,
      `${count} people in ${generations} generations.`,
    )
    if (content === 'line' && linePerson) {
      const p = index.byId.get(linePerson)
      const depth = lineDepth(index, linePerson)
      const pedigree = lineScope.side === 0 && (lineScope.down === 0 || depth.down === 0)
      const name = p?.name ?? ''
      return {
        kicker,
        title: pedigree
          ? t(`Ahnentafel von ${name}`, `Pedigree of ${name}`)
          : t(`Linie von ${name}`, `Line of ${name}`),
        lines: [`${describeLineScope(lineScope, depth, lang)}. ${people}`],
        legendLine: pedigree ? null : t('direkte Linie', 'direct line'),
      }
    }
    if (content === 'relation' && pair) {
      const a = index.byId.get(pair.from)
      const b = index.byId.get(pair.to)
      const c = findConnection(index, pair.from, pair.to)
      const text = a && b && c ? describeRelation(index, c, a, b, null, lang) : null
      return {
        kicker,
        title: `${a?.name ?? ''} ${t('und', 'and')} ${b?.name ?? ''}`,
        lines: text
          ? [[text.forward, text.backward].filter(Boolean).join(' '), text.common ?? ''].filter(Boolean)
          : [
              t(
                'Im Stammbaum gibt es keine Verbindung zwischen den beiden.',
                'The family tree has no connection between the two.',
              ),
            ],
        legendLine: null,
      }
    }
    return {
      kicker: t('Die ganze Familie', 'The whole family'),
      title: kicker,
      lines: [people],
      legendLine: null,
    }
  }, [content, tree, layout, linePerson, pair, familyName, index, lineScope, t, lang])
}

function Sheet({
  geo,
  layout,
  scale,
  tree,
  highlight,
  heading,
}: {
  geo: ReturnType<typeof sheetGeometry>
  layout: TreeLayout | null
  scale: number
  tree: Tree
  highlight: Set<string> | null
  heading: Heading
}) {
  const { t, lang } = useLang()
  const mm = (v: number) => `${v}mm`
  const today = new Date().toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' })
  const adopted = layout?.connectors.some((c) => c.adopted)

  return (
    <article
      className="print-sheet relative overflow-hidden bg-white text-ink shadow-lifted"
      style={
        {
          width: mm(geo.w),
          height: mm(geo.h),
          padding: mm(geo.margin),
          fontSize: mm(3.3 * geo.k),
          '--sheet-h': mm(geo.h),
        } as React.CSSProperties
      }
    >
      {/* Doppelter Goldrahmen */}
      <div
        className="relative flex h-full flex-col"
        style={{ border: `${geo.border}mm solid rgb(var(--gilt))`, padding: mm(geo.pad) }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: mm(1.3 * geo.k), border: `${0.18 * geo.k}mm solid rgb(var(--gilt) / 0.65)` }}
        />

        <header className="flex flex-col items-center text-center" style={{ height: mm(geo.header) }}>
          <p className="font-serif italic text-ink-muted" style={{ fontSize: '0.95em' }}>
            {heading.kicker}
          </p>
          <h2 className="font-display leading-[1.1] text-ink" style={{ fontSize: '2.15em', marginTop: '0.1em' }}>
            {heading.title}
          </h2>
          <Flourish
            className="text-gilt"
            style={{ width: mm(58 * geo.k), height: mm(3.6 * geo.k), margin: '0.35em 0' }}
          />
          {heading.lines.map((l) => (
            <p key={l} className="max-w-[85%] font-serif leading-snug text-ink-muted" style={{ fontSize: '0.9em' }}>
              {l}
            </p>
          ))}
        </header>

        <div className="grid min-h-0 flex-1 place-items-center">
          {layout ? (
            <div style={{ width: layout.width * scale, height: layout.height * scale }}>
              <div
                className="relative"
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <Connectors
                  width={layout.width}
                  height={layout.height}
                  connectors={layout.connectors}
                  marriages={layout.marriages}
                  lineage={highlight}
                  drawKey="druck"
                  still
                />
                {layout.cards.map((c) => {
                  const person = tree.members[c.id]
                  if (!person) return null
                  return (
                    <PersonCard
                      key={c.id}
                      person={person}
                      box={c}
                      state={highlight?.has(c.id) ? 'line' : 'normal'}
                      isMe={false}
                      onSelect={noop}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="font-serif italic text-ink-muted">
              {t('Der Baum wird angeordnet …', 'Arranging the tree …')}
            </p>
          )}
        </div>

        <footer
          className="flex items-end justify-between font-serif text-ink-muted"
          style={{ height: mm(geo.footer), fontSize: '0.8em' }}
        >
          <span className="flex items-center" style={{ gap: '1.4em' }}>
            <span className="flex items-center" style={{ gap: '0.4em' }}>
              <Rings /> {t('verheiratet', 'married')}
            </span>
            {heading.legendLine && (
              <span className="flex items-center" style={{ gap: '0.4em' }}>
                <span
                  className="inline-block"
                  style={{ width: '1.8em', height: '0.18em', background: 'rgb(var(--gilt))' }}
                />
                {heading.legendLine}
              </span>
            )}
            {adopted && (
              <span className="flex items-center" style={{ gap: '0.4em' }}>
                <span
                  className="inline-block"
                  style={{ width: '1.8em', borderTop: '0.12em dashed rgb(var(--line))' }}
                />
                {t('adoptiert', 'adopted')}
              </span>
            )}
          </span>
          <span>
            {t('Stand', 'As of')}: {today}
          </span>
        </footer>
      </div>
    </article>
  )
}

const noop = () => {}

/** ⚭ als zwei verschlungene Ringe, wie im Baum */
function Rings() {
  return (
    <svg viewBox="0 0 16 10" style={{ width: '1.3em', height: '0.85em' }} aria-hidden>
      <g fill="none" style={{ stroke: 'rgb(var(--ink-muted))' }} strokeWidth="1.2">
        <circle cx="5.6" cy="5" r="3.6" />
        <circle cx="10.4" cy="5" r="3.6" />
      </g>
    </svg>
  )
}
