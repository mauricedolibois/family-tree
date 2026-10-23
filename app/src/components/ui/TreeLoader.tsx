// src/components/ui/TreeLoader.tsx
// Loading animation: a small tree grows from its trunk, forks three times and
// withdraws again from the twigs down.

import clsx from 'clsx'

type Segment = { d: string; width: number; level: number }

const LEVELS = 3

/** Symmetric forks, each pair a little narrower and shorter than the one below */
function growTree(): Segment[] {
  const out: Segment[] = []
  const branch = (x: number, y: number, angle: number, length: number, width: number, level: number) => {
    const x2 = x + length * Math.sin(angle)
    const y2 = y - length * Math.cos(angle)
    out.push({ d: `M${f(x)} ${f(y)}L${f(x2)} ${f(y2)}`, width, level })
    if (level === LEVELS) return
    for (const side of [-1, 1]) branch(x2, y2, angle + side * 0.5, length * 0.72, width * 0.7, level + 1)
  }
  branch(32, 58, 0, 18, 4, 0)
  return out
}

const f = (n: number) => n.toFixed(1)
const TREE = growTree()

// One cycle: grow level by level, rest a moment, withdraw from the twigs down.
// The gap is a little longer than a branch, so hidden branches leave no dot of their round cap.
const CYCLE_MS = 2800
const GROW_END = 50
const REST_END = 64
const keyframes = Array.from({ length: LEVELS + 1 }, (_, level) => {
  const growStep = GROW_END / (LEVELS + 1)
  const shrinkStep = (100 - REST_END) / (LEVELS + 1)
  const grow0 = level * growStep
  const grow1 = grow0 + growStep
  const shrink0 = REST_END + (LEVELS - level) * shrinkStep
  const shrink1 = shrink0 + shrinkStep
  return `@keyframes tree-loader-${level}{0%,${grow0}%{stroke-dashoffset:1}${grow1}%,${shrink0}%{stroke-dashoffset:0}${shrink1}%,100%{stroke-dashoffset:1}}`
}).join('')
const CSS = `${keyframes}
.tree-loader path{stroke-dasharray:1 1.05;stroke-dashoffset:1;animation:${CYCLE_MS}ms ease-in-out infinite}
${Array.from({ length: LEVELS + 1 }, (_, l) => `.tree-loader path[data-level="${l}"]{animation-name:tree-loader-${l}}`).join('\n')}
@media (prefers-reduced-motion: reduce){.tree-loader path{animation:none;stroke-dashoffset:0}}`

export function TreeLoader({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 60" className={clsx('tree-loader h-16 w-16', className)} aria-hidden>
      <style>{CSS}</style>
      <g fill="none" strokeLinecap="round" className="stroke-accent">
        {TREE.map((s, i) => (
          <path key={i} d={s.d} strokeWidth={s.width} pathLength={1} data-level={s.level} />
        ))}
      </g>
    </svg>
  )
}
