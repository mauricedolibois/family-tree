// src/components/ui/Button.tsx
// Buttons: primary (filled), secondary (on a surface), quiet (text only), danger.

import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'
type Size = 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover shadow-[inset_0_-1px_0_rgb(0_0_0/0.25)] disabled:bg-primary/50',
  secondary:
    'border border-card-rule bg-card text-ink hover:border-line hover:bg-canvas-raised disabled:text-ink-faint',
  quiet: 'text-ink-muted hover:bg-canvas-raised hover:text-ink disabled:text-ink-faint',
  danger: 'text-danger hover:bg-danger-soft disabled:opacity-50',
}

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px]',
  sm: 'h-9 px-3 text-sm',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: React.ReactNode
  /** Shows a turning ring instead of the icon and blocks further clicks */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed',
        loading && 'disabled:cursor-progress',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
})
