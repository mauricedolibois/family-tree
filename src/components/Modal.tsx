// src/components/Modal.tsx
'use client'

import { useEffect, useId, useRef } from 'react'
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

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Body-Scroll verhindern, solange Modal offen ist
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, onClose])

  // Klicks im Dialog nicht zum Backdrop „durchfallen“ lassen
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
        className="
          relative z-10
          w-[min(100vw-1rem,56rem)]      /* max Breite mit Rand auf Mobile */
          max-w-[56rem]
          max-h-[calc(100svh-1rem)]      /* überschreitet nicht die Höhe, svh = mobile safe viewport */
          h-auto
          flex flex-col
          rounded-2xl
          bg-[color:var(--color-surface-100)]
          shadow-xl
          ring-1 ring-[color:var(--color-primary-50)]
          overflow-hidden
          animate-in fade-in zoom-in-95 duration-150
        "
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
          className="
            flex-1 overflow-y-auto overscroll-contain
            px-4 sm:px-5 py-4
            text-[color:var(--color-primary-800)]
          "
        >
          {children}
        </div>

        {/* Optionaler Footer (wenn du Buttons brauchst)
        <div className="sticky bottom-0 bg-[color:var(--color-surface-50)] border-t border-[color:var(--color-primary-50)] px-4 sm:px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-[color:var(--color-secondary)] text-white hover:bg-[color:var(--color-secondary-700)] transition"
          >
            Schließen
          </button>
        </div>
        */}
      </div>
    </div>,
    document.body
  )
}
