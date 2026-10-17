// src/components/ui/Button.tsx
// Knöpfe des Style-Systems: primary (Leinen), secondary (Pergament), quiet (nur Text), danger.

import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'
type Size = 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-linen text-card hover:bg-linen-hover shadow-[inset_0_-1px_0_rgb(0_0_0/0.25)] disabled:bg-linen/50',
  secondary: 'border border-card-rule bg-card text-ink hover:border-line hover:bg-paper-raised disabled:text-ink-faint',
  quiet: 'text-ink-muted hover:bg-paper-raised hover:text-ink disabled:text-ink-faint',
  danger: 'text-danger hover:bg-danger-soft disabled:opacity-50',
}

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px]',
  sm: 'h-9 px-3 text-sm',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: React.ReactNode }

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})
