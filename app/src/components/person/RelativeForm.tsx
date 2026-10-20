// src/components/person/RelativeForm.tsx
// Add a new person related to the selected one, with the key details right away;
// everything else can be filled in later.

import { useEffect, useRef, useState } from 'react'
import { parentsOf, spouseOf, type Gender, type Person } from '@/family/model'
import { addRelative, updatePerson, type Relation } from '@/family/edit'
import { parseDateInput, splitName } from '@/family/format'
import { TreeConflictError, useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'
import { Button } from '@/components/ui/Button'
import { Segmented, Toggle } from '@/components/ui/Choice'
import { errorText } from '@/i18n/errors'
import { useI18n } from '@/i18n/I18nProvider'

type Props = {
  person: Person
  relation: Relation
  onDone: () => void
  /** open the new person for editing after saving */
  onEditNew: (id: string) => void
}

export function RelativeForm({ person, relation, onDone, onEditNew }: Props) {
  const { tree, index, commit, saving } = useFamily()
  const { focusOn } = useView()
  const { notify } = useToast()
  const { t, locale } = useI18n()
  const nameInput = useRef<HTMLInputElement>(null)

  const spouseId = spouseOf(index, person.id)
  const spouse = spouseId ? index.byId.get(spouseId) : null
  const existingParents = parentsOf(index, person.id)
  const lonelyParent =
    existingParents.length === 1 && !index.byId.get(existingParents[0])?.spouseId
      ? index.byId.get(existingParents[0])
      : null

  // Suggest the family surname for children
  const familySurname = splitName(person.name).surname
  const [name, setName] = useState(relation === 'CHILD' && familySurname ? ` ${familySurname}` : '')
  const [gender, setGender] = useState<Gender | ''>(
    relation === 'SPOUSE' ? (person.gender === 'MALE' ? 'FEMALE' : 'MALE') : '',
  )
  const [birthDate, setBirthDate] = useState('')
  const [dead, setDead] = useState(false)
  const [alsoChildOfSpouse, setAlsoChildOfSpouse] = useState(true)
  const [adopted, setAdopted] = useState(false)
  const [marry, setMarry] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = nameInput.current
    if (!el) return
    el.focus()
    el.setSelectionRange(0, 0) // caret before the suggested surname
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError(t.errors.edit.nameRequired())
    if (!gender) return setError(t.relative.chooseGender)
    const born = parseDateInput(birthDate)
    if (born === undefined) return setError(t.relative.birthInvalid(t.format.datePlaceholder))
    try {
      const added = addRelative(tree, person.id, {
        relation,
        name,
        gender,
        adopted,
        alsoChildOfSpouse,
        marryExistingParent: marry,
      })
      const next =
        born || dead
          ? updatePerson(added.tree, added.id, { profile: { birthDate: born, deceased: dead || undefined } })
          : added.tree
      const undo = await commit(next)
      const newName = name.trim()
      onDone()
      notify({
        message: t.relative.added(newName),
        undo,
        action: {
          label: t.relative.completeDetails,
          run: () => {
            focusOn(added.id)
            onEditNew(added.id)
          },
        },
      })
    } catch (err) {
      if (err instanceof TreeConflictError) return
      setError(errorText(err, t, locale, t.errors.saveFailed))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-tour="relative-form">
      <div>
        <h2 className="font-display text-[1.5rem] leading-tight text-ink">{t.relative.title[relation]}</h2>
        <p className="mt-1 text-[15px] text-ink-muted">{t.relative.subtitle[relation](person.name)}</p>
      </div>

      <div>
        <label htmlFor="rel-name" className="field-label">
          {t.form.fullName}
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
        {relation === 'SPOUSE' && <p className="mt-1.5 text-sm text-ink-faint">{t.relative.spouseNameHint}</p>}
      </div>

      <Segmented<Gender | ''>
        label={t.form.gender}
        value={gender}
        onChange={setGender}
        options={[
          { value: 'MALE', label: t.form.man },
          { value: 'FEMALE', label: t.form.woman },
        ]}
      />

      <div>
        <label htmlFor="rel-born" className="field-label">
          {t.relative.birthDate} <span className="font-normal text-ink-faint">{t.relative.ifKnown}</span>
        </label>
        <input
          id="rel-born"
          className="field"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          placeholder={t.relative.birthPlaceholder(t.format.datePlaceholder)}
          autoComplete="off"
        />
      </div>

      <Toggle checked={dead} onChange={setDead}>
        {t.relative.alreadyDeceased}
      </Toggle>

      {relation === 'CHILD' && (
        <div className="flex flex-col gap-2">
          {spouse && (
            <Toggle checked={alsoChildOfSpouse} onChange={setAlsoChildOfSpouse}>
              {t.relative.alsoChildOf(spouse.name)}
            </Toggle>
          )}
          <Toggle checked={adopted} onChange={setAdopted}>
            {t.relative.adopted}
          </Toggle>
        </div>
      )}
      {relation === 'PARENT' && lonelyParent && (
        <Toggle checked={marry} onChange={setMarry}>
          {t.relative.marriedTo(lonelyParent.name)}
        </Toggle>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving} className="flex-1">
          {saving ? t.form.saving : t.relative.add}
        </Button>
        <Button variant="quiet" onClick={onDone} data-tour="form-cancel">
          {t.form.cancel}
        </Button>
      </div>
    </form>
  )
}
