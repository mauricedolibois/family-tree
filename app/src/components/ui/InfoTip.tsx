// src/components/ui/InfoTip.tsx
// A small "i" next to a label that opens an explanation with examples: on hover
// with a mouse, on tap or click everywhere (touch has no hover), closed with
// Escape or a click outside. A click keeps it open after the mouse leaves. It opens
// to the right and moves left as far as needed to stay on screen.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Info } from 'lucide-react'

export function InfoTip({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const box = useRef<HTMLSpanElement | null>(null)
  const note = useRef<HTMLSpanElement | null>(null)
  const [shift, setShift] = useState(0)
  const id = useId()
  const open = hover || pinned

  // Measured unshifted on opening, then moved left to keep a gutter to the screen's edge
  useLayoutEffect(() => {
    if (!open || !note.current) return setShift(0)
    setShift(Math.max(0, note.current.getBoundingClientRect().right - (window.innerWidth - 16)))
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const outside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setPinned(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [pinned])

  return (
    <span
      ref={box}
      className="relative inline-flex align-middle"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setPinned((p) => !p)}
        className={clsx(
          'grid h-6 w-6 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink',
          pinned && 'bg-canvas-raised text-ink',
        )}
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span
          ref={note}
          id={id}
          role="note"
          style={{ transform: shift ? `translateX(-${shift}px)` : undefined }}
          className={clsx(
            'surface absolute -left-2 top-full z-40 mt-1 rounded-control border border-frame/60 p-3 text-left text-sm font-normal normal-case tracking-normal text-ink shadow-lifted',
            wide ? 'w-[min(26rem,calc(100vw-2rem))]' : 'w-[min(18rem,calc(100vw-2rem))]',
          )}
        >
          {children}
        </span>
      )}
    </span>
  )
}
