// src/components/person/RelativeForm.tsx
// Neue Person in Beziehung zur gewählten Person anlegen – direkt mit
// den wichtigsten Angaben, der Rest lässt sich später ergänzen.

import { useEffect, useRef, useState } from 'react'
import { parentsOf, spouseOf, type Gender, type Person } from '@/family/model'
import { addRelative, EditError, updatePerson, type Relation } from '@/family/edit'
import { parseDateInput, splitName } from '@/family/format'
import { TreeConflictError, useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'
import { Button } from '@/components/ui/Button'
import { Segmented, Toggle } from '@/components/ui/Choice'

const TITLES: Record<Relation, string> = {
  CHILD: 'Kind hinzufügen',
  SPOUSE: 'Ehepartner hinzufügen',
  PARENT: 'Elternteil hinzufügen',
}

type Props = {
  person: Person
  relation: Relation
  onDone: () => void
  /** nach dem Speichern die neue Person bearbeiten */
  onEditNew: (id: string) => void
}

export function RelativeForm({ person, relation, onDone, onEditNew }: Props) {
  const { tree, index, commit, saving } = useFamily()
  const { focusOn } = useView()
  const { notify } = useToast()
  const nameInput = useRef<HTMLInputElement>(null)

  const spouseId = spouseOf(index, person.id)
  const spouse = spouseId ? index.byId.get(spouseId) : null
  const existingParents = parentsOf(index, person.id)
  const lonelyParent =
    existingParents.length === 1 && !index.byId.get(existingParents[0])?.spouseId
      ? index.byId.get(existingParents[0])
      : null

  // Für Kinder den Nachnamen der Familie vorschlagen
  const familySurname = splitName(person.name).surname
  const [name, setName] = useState(relation === 'CHILD' && familySurname ? ` ${familySurname}` : '')
  const [gender, setGender] = useState<Gender | ''>(
    relation === 'SPOUSE' ? (person.gender === 'MALE' ? 'FEMALE' : 'MALE') : '',
  )
  const [birthDate, setBirthDate] = useState('')
  const [alsoChildOfSpouse, setAlsoChildOfSpouse] = useState(true)
  const [adopted, setAdopted] = useState(false)
  const [marry, setMarry] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = nameInput.current
    if (!el) return
    el.focus()
    el.setSelectionRange(0, 0) // Cursor vor den vorgeschlagenen Nachnamen
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Bitte einen Namen eingeben.')
    if (!gender) return setError('Bitte wähle Mann oder Frau.')
    const born = parseDateInput(birthDate)
    if (born === undefined) return setError('Bitte das Geburtsdatum als TT.MM.JJJJ eingeben – oder nur das Jahr.')
    try {
      const added = addRelative(tree, person.id, {
        relation,
        name,
        gender,
        adopted,
        alsoChildOfSpouse,
        marryExistingParent: marry,
      })
      const next = born ? updatePerson(added.tree, added.id, { profile: { birthDate: born } }) : added.tree
      await commit(next)
      const newName = name.trim()
      onDone()
      notify({
        message: `${newName} wurde hinzugefügt.`,
        action: {
          label: 'Angaben ergänzen',
          run: () => {
            focusOn(added.id)
            onEditNew(added.id)
          },
        },
      })
    } catch (err) {
      if (err instanceof TreeConflictError) return
      setError(err instanceof EditError || err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-[1.5rem] leading-tight text-ink">{TITLES[relation]}</h2>
        <p className="mt-1 text-[15px] text-ink-muted">
          {relation === 'CHILD' && <>Kind von {person.name}</>}
          {relation === 'SPOUSE' && <>Ehepartner von {person.name}</>}
          {relation === 'PARENT' && <>Mutter oder Vater von {person.name}</>}
        </p>
      </div>

      <div>
        <label htmlFor="rel-name" className="field-label">
          Vor- und Nachname
        </label>
        <input
          id="rel-name"
          ref={nameInput}
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
        />
        {relation === 'SPOUSE' && (
          <p className="mt-1.5 text-sm text-ink-faint">
            Bei Frauen am besten den Geburtsnamen, z. B. „Anna Maria Schmidt“.
          </p>
        )}
      </div>

      <Segmented<Gender | ''>
        label="Geschlecht"
        value={gender}
        onChange={setGender}
        options={[
          { value: 'MALE', label: 'Mann' },
          { value: 'FEMALE', label: 'Frau' },
        ]}
      />

      <div>
        <label htmlFor="rel-born" className="field-label">
          Geburtsdatum <span className="font-normal text-ink-faint">(falls bekannt)</span>
        </label>
        <input
          id="rel-born"
          className="field"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          placeholder="TT.MM.JJJJ oder nur das Jahr"
          autoComplete="off"
        />
      </div>

      {relation === 'CHILD' && (
        <div className="flex flex-col gap-2">
          {spouse && (
            <Toggle checked={alsoChildOfSpouse} onChange={setAlsoChildOfSpouse}>
              Auch Kind von {spouse.name}
            </Toggle>
          )}
          <Toggle checked={adopted} onChange={setAdopted}>
            Adoptiert
          </Toggle>
        </div>
      )}
      {relation === 'PARENT' && lonelyParent && (
        <Toggle checked={marry} onChange={setMarry}>
          Verheiratet mit {lonelyParent.name}
        </Toggle>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving} className="flex-1">
          {saving ? 'Wird gespeichert …' : 'Hinzufügen'}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
