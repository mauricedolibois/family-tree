// src/components/Modal.tsx
'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Poppins } from 'next/font/google'

const poppins = Poppins({ subsets: ['latin'], weight: '300' })

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [hasXOverflow, setHasXOverflow] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    const content = contentRef.current
    if (!dialog || !content) return

    const check = () => {
      const dw = dialog.clientWidth
      const cw = content.scrollWidth
      const overflow = cw > dw + 1
      setHasXOverflow(overflow)
      if (overflow) {
        // eslint-disable-next-line no-console
        console.warn('[Modal] Horizontaler Overflow:', { dialogClientWidth: dw, contentScrollWidth: cw })
      }
    }

    check()
    const ro = new ResizeObserver(check)
    ro.observe(dialog)
    ro.observe(content)
    window.addEventListener('resize', check)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [isOpen])

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  if (!isOpen) return null

  return createPortal(
    <div
      className={`${poppins.className} fixed inset-0 z-50 flex items-center justify-center`}
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Backdrop */}
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        onClick={stop}
        className={`
          relative z-10
          w-full max-w-[56rem] mx-2  /* volle Breite, aber hart begrenzt; seitlicher Rand auf Mobile */
          max-h-[calc(100svh-1rem)]
          h-auto
          flex flex-col box-border   /* Box-Sizing fix */
          rounded-2xl
          bg-[color:var(--color-surface-100)]
          shadow-xl
          ring-1 ring-[color:var(--color-primary-50)]
          overflow-hidden
          ${hasXOverflow ? 'outline outline-1 outline-[color:var(--color-accent-100)]' : ''}
          animate-in fade-in zoom-in-95 duration-150
        `}
      >
        {/* Header */}
        <div
          className="
            sticky top-0 z-20
            bg-[color:var(--color-primary)]
            text-white
            flex items-center justify-between
            px-4 sm:px-5 py-3
            border-b border-[color:var(--color-primary-700)]
          "
        >
          <h3 id={titleId} className="text-base sm:text-lg font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="
              rounded-full p-2
              hover:bg-white/10 active:bg-white/20
              focus:outline-none focus:ring-2 focus:ring-white/60
            "
          >
            ✕
          </button>
        </div>

       {/* Content */}
<div
  ref={contentRef}
  className="
    flex-1 overflow-y-auto overscroll-contain
    px-4 sm:px-5 py-4
    text-[color:var(--color-primary-800)]
    overflow-x-hidden
  "
>
  {/* ⬇️ SCOPED Fix: neutralisiere .w-full nur innerhalb des Modals */}
  <div
    className="
      min-w-0 max-w-full break-words
      [&_.w-full]:w-auto
      [&_.w-full]:max-w-full
      [&_*]:min-w-0
      [&_img]:max-w-full [&_video]:max-w-full
    "
  >
    {children}
  </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
