// src/components/app/SearchBox.tsx
// Find people and jump to them in the tree.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { useFamily } from './FamilyProvider'
import { useView } from './ViewProvider'
import { lifeYears } from '@/family/format'
import { searchPeople } from '@/family/search'
import { Portrait } from '@/components/ui/Portrait'
import { useI18n } from '@/i18n/I18nProvider'

const MAX_RESULTS = 8

export function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { tree } = useFamily()
  const { focusOn } = useView()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])

  const results = useMemo(() => searchPeople(tree, query, MAX_RESULTS), [query, tree])

  const choose = (id: string) => {
    focusOn(id)
    setQuery('')
    setOpen(false)
    input.current?.blur()
    onDone?.()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      choose(results[active].id)
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      onDone?.()
    }
  }

  const showList = open && query.trim().length > 0

  return (
    <div className="relative w-full">
      <label className="relative block">
        <span className="sr-only">{t.search.label}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={t.search.label}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-full border border-transparent bg-canvas-raised pl-10 pr-9 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label={t.search.clear}
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-faint hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-12 z-50 max-h-[60vh] overflow-auto rounded-card border border-card-rule bg-card p-1 shadow-lifted"
        >
          {results.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">{t.relation.nobody}</li>}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p.id)}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left',
                  i === active && 'bg-canvas-raised',
                )}
              >
                <Portrait person={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-text text-base font-semibold text-ink">{p.name}</span>
                  <span className="block truncate font-text text-[14px] text-ink-muted">
                    {[lifeYears(p), p.profile?.city].filter(Boolean).join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
