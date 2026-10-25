// Zooming the tree by a factor, the same at every scale. react-zoom-pan-pinch 4
// adds a fixed amount to the scale per step (and per pixel of a wheel turn), so one
// wheel notch jumped from far away to close up, and +/- were huge steps when far
// away and tiny ones close up.

import { useEffect, type RefObject } from 'react'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'

/** Scale change per pixel of a wheel turn: a usual notch (100 px) zooms by about 16 % */
const WHEEL_RATE = 0.0015
/** Pinching on a touchpad arrives as wheel events with ctrl held and small deltas */
const PINCH_RATE = 0.01
/** One press of + or − */
export const BUTTON_FACTOR = 1.4

type Api = RefObject<ReactZoomPanPinchContentRef | null>

/** Zooms by `factor` around a point of the wrapper (default: its centre), within the scale limits */
export function zoomBy(
  api: Api,
  factor: number,
  limits: { min: number; max: number },
  point?: { x: number; y: number },
  time = 0,
) {
  const a = api.current
  const wrapper = a?.instance.wrapperComponent
  if (!a || !wrapper) return
  const { scale, positionX, positionY } = a.instance.state
  const next = Math.min(limits.max, Math.max(limits.min, scale * factor))
  if (next === scale) return
  const x = point?.x ?? wrapper.clientWidth / 2
  const y = point?.y ?? wrapper.clientHeight / 2
  const k = next / scale
  // The point under the pointer stays where it is
  a.setTransform(x - (x - positionX) * k, y - (y - positionY) * k, next, time)
}

/** The wheel zooms by a factor around the pointer; pass `wheel={{ disabled: true }}` to the TransformWrapper */
export function useWheelZoom(api: Api, limits: { min: number; max: number }, enabled = true) {
  const { min, max } = limits
  useEffect(() => {
    const wrapper = api.current?.instance.wrapperComponent
    if (!wrapper || !enabled) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Lines or pages instead of pixels (Firefox with some mice)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? wrapper.clientHeight : 1
      const delta = Math.max(-300, Math.min(300, e.deltaY * unit))
      const rect = wrapper.getBoundingClientRect()
      zoomBy(
        api,
        Math.exp(-delta * (e.ctrlKey ? PINCH_RATE : WHEEL_RATE)),
        { min, max },
        {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        },
      )
    }
    // Not passive: the page itself must not scroll or zoom
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [api, min, max, enabled])
}
