// src/components/member-details/ChipButtons.tsx
import React from 'react'

export function ChipButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      type="button"
      {...rest}
      className={
        'inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 ' +
        className
      }
    />
  )
}

export function ChipDangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      type="button"
      {...rest}
      className={
        'inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 ' +
        className
      }
    />
  )
}
