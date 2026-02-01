import { PositionedNode } from '@/types/family'

export type EdgeStyle = 'rounded' | 'orthogonal'

export function edgePath(
  from: PositionedNode,
  to: PositionedNode,
  opts?: {
    fromSide?: 'top' | 'bottom'
    toSide?: 'top' | 'bottom'
    style?: EdgeStyle
  }
) {
  const fs = opts?.fromSide ?? 'bottom'
  const ts = opts?.toSide ?? 'top'
  const style: EdgeStyle = opts?.style ?? 'rounded'

  const fx = from.x + from.w / 2
  const fy = fs === 'bottom' ? from.y + from.h : from.y
  const tx = to.x + to.w / 2
  const ty = ts === 'top' ? to.y : to.y + to.h

  if (style === 'orthogonal') {
    // step-like (vertical → horizontal → vertical)
    const midY = (fy + ty) / 2
    return `M ${fx} ${fy} L ${fx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
  }

  // default: rounded (cubic)
  const midY = fy + (ty - fy) * 0.5
  return `M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`
}

export function spouseLine(a: PositionedNode, b: PositionedNode) {
  const L = a.x <= b.x ? a : b
  const R = a.x <= b.x ? b : a
  const yLine = L.y + L.h * 0.5
  const x1 = L.x + L.w
  const x2 = R.x
  return { x1, y1: yLine, x2, y2: yLine }
}
