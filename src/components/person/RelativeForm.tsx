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
import { useLang } from '@/i18n/lang'

const TITLES: Record<Relation, [string, string]> = {
  CHILD: ['Kind hinzufügen', 'Add a child'],
  SPOUSE: ['Ehepartner hinzufügen', 'Add a spouse'],
  PARENT: ['Elternteil hinzufügen', 'Add a parent'],
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
  const { t } = useLang()
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
  const [dead, setDead] = useState(false)
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
    if (!name.trim()) return setError(t('Bitte einen Namen eingeben.', 'Please enter a name.'))
    if (!gender) return setError(t('Bitte wähle Mann oder Frau.', 'Please choose male or female.'))
    const born = parseDateInput(birthDate)
    if (born === undefined)
      return setError(
        t(
          'Bitte das Geburtsdatum als TT.MM.JJJJ eingeben – oder nur das Jahr.',
          'Please enter the date of birth as MM/DD/YYYY – or just the year.',
        ),
      )
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
      await commit(next)
      const newName = name.trim()
      onDone()
      notify({
        message: t(`${newName} wurde hinzugefügt.`, `${newName} was added.`),
        action: {
          label: t('Angaben ergänzen', 'Add details'),
          run: () => {
            focusOn(added.id)
            onEditNew(added.id)
          },
        },
      })
    } catch (err) {
      if (err instanceof TreeConflictError) return
      setError(
        err instanceof EditError
          ? t(err.message, err.en)
          : err instanceof Error
          ? err.message
          : t('Speichern fehlgeschlagen.', 'Saving failed.'),
      )
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-tour="relative-form">
      <div>
        <h2 className="font-display text-[1.5rem] leading-tight text-ink">{t(...TITLES[relation])}</h2>
        <p className="mt-1 text-[15px] text-ink-muted">
          {relation === 'CHILD' && t(`Kind von ${person.name}`, `Child of ${person.name}`)}
          {relation === 'SPOUSE' && t(`Ehepartner von ${person.name}`, `Spouse of ${person.name}`)}
          {relation === 'PARENT' && t(`Mutter oder Vater von ${person.name}`, `Mother or father of ${person.name}`)}
        </p>
      </div>

      <div>
        <label htmlFor="rel-name" className="field-label">
          {t('Vor- und Nachname', 'First and last name')}
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
            {t(
              'Bei Frauen am besten den Geburtsnamen, z. B. „Anna Maria Schmidt“.',
              'For women, the maiden name works best, e.g. “Anna Maria Schmidt”.',
            )}
          </p>
        )}
      </div>

      <Segmented<Gender | ''>
        label={t('Geschlecht', 'Gender')}
        value={gender}
        onChange={setGender}
        options={[
          { value: 'MALE', label: t('Mann', 'Male') },
          { value: 'FEMALE', label: t('Frau', 'Female') },
        ]}
      />

      <div>
        <label htmlFor="rel-born" className="field-label">
          {t('Geburtsdatum', 'Date of birth')}{' '}
          <span className="font-normal text-ink-faint">{t('(falls bekannt)', '(if known)')}</span>
        </label>
        <input
          id="rel-born"
          className="field"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          placeholder={t('TT.MM.JJJJ oder nur das Jahr', 'MM/DD/YYYY or just the year')}
          autoComplete="off"
        />
      </div>

      <Toggle checked={dead} onChange={setDead}>
        {t('Bereits verstorben', 'Already deceased')}
      </Toggle>

      {relation === 'CHILD' && (
        <div className="flex flex-col gap-2">
          {spouse && (
            <Toggle checked={alsoChildOfSpouse} onChange={setAlsoChildOfSpouse}>
              {t(`Auch Kind von ${spouse.name}`, `Also a child of ${spouse.name}`)}
            </Toggle>
          )}
          <Toggle checked={adopted} onChange={setAdopted}>
            {t('Adoptiert', 'Adopted')}
          </Toggle>
        </div>
      )}
      {relation === 'PARENT' && lonelyParent && (
        <Toggle checked={marry} onChange={setMarry}>
          {t(`Verheiratet mit ${lonelyParent.name}`, `Married to ${lonelyParent.name}`)}
        </Toggle>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving} className="flex-1">
          {saving ? t('Wird gespeichert …', 'Saving …') : t('Hinzufügen', 'Add')}
        </Button>
        <Button variant="quiet" onClick={onDone} data-tour="form-cancel">
          {t('Abbrechen', 'Cancel')}
        </Button>
      </div>
    </form>
  )
}
