// src/components/relation/PersonPicker.tsx
// Eine Person für die Beziehungsansicht: als kleine Karte oder, beim Ändern, als Suchfeld.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { UserSearch, X } from 'lucide-react'
import type { Person } from '@/family/model'
import { lifeYears, splitName } from '@/family/format'
import { searchPeople } from '@/family/search'
import { useFamily } from '@/components/app/FamilyProvider'
import { Portrait } from '@/components/ui/Portrait'

/** Gewählte Person als kompakte Karte, leer als gestrichelte Fläche */
export function PersonChip({
  person,
  label,
  onClick,
}: {
  person: Person | null
  /** Für Screenreader: „Erste Person“, „Zweite Person“ */
  label: string
  onClick: () => void
}) {
  if (!person) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} wählen`}
        className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-control border border-dashed border-gilt/70 px-2 text-[15px] text-ink-muted hover:border-gilt hover:bg-gilt-soft/40 hover:text-ink"
      >
        <UserSearch className="h-4 w-4 shrink-0" />
        <span className="truncate">Person wählen</span>
      </button>
    )
  }
  const { given, surname } = splitName(person.name)
  const years = lifeYears(person)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${person.name}. Ändern`}
      className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-control border border-gilt/60 bg-card/80 px-2 text-left hover:border-gilt hover:bg-card"
    >
      <Portrait person={person} size="sm" className="hidden min-[400px]:inline-grid" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-serif text-[15.5px] font-semibold text-ink">{given || surname}</span>
        <span className="block truncate font-serif text-[13.5px] text-ink-muted">
          {[given && surname, years].filter(Boolean).join(', ')}
        </span>
      </span>
    </button>
  )
}

/** Suchfeld mit Trefferliste; Escape oder ✕ bricht ab */
export function PersonSearchField({
  label,
  exclude,
  onPick,
  onCancel,
}: {
  label: string
  exclude: string[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const { tree } = useFamily()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const results = useMemo(() => searchPeople(tree, query, 6, exclude), [tree, query, exclude])

  useEffect(() => input.current?.focus(), [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      onPick(results[active].id)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }

  const open = query.trim().length > 0

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">{label} suchen</span>
        <UserSearch className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Name, Ort oder Geburtsjahr"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="field h-12 pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label="Abbrechen"
          className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </label>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[3.25rem] z-50 max-h-[min(22rem,45dvh)] overflow-auto rounded-card border border-card-rule bg-card p-1 shadow-lifted"
        >
          {results.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">Niemand gefunden.</li>}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(p.id)}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left',
                  i === active && 'bg-paper-raised',
                )}
              >
                <Portrait person={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-base font-semibold text-ink">{p.name}</span>
                  <span className="block truncate font-serif text-[14px] text-ink-muted">
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
