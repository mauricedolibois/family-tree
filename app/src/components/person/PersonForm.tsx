// src/components/person/PersonForm.tsx
// Angaben zu einer Person bearbeiten, inklusive Fotos und Dokumente.

import { useRef, useState } from 'react'
import clsx from 'clsx'
import { FileText, ImagePlus, Star, Trash2 } from 'lucide-react'
import type { Gender, Person } from '@/family/model'
import { addExistingParent, spouseOfSingleParent, updatePerson } from '@/family/edit'
import { isDeceased, parseDateInput, toDateInput } from '@/family/format'
import type { StoredMedia } from '@/storage/schema'
import { TreeConflictError, useFamily } from '@/components/app/FamilyProvider'
import { useToast } from '@/components/app/Toast'
import { Button } from '@/components/ui/Button'
import { Segmented, Toggle } from '@/components/ui/Choice'
import { MediaImage } from '@/components/ui/MediaImage'
import { uploadFiles } from './upload'

export function PersonForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const { tree, commit, saving } = useFamily()
  const { notify } = useToast()
  const p = person.profile ?? {}

  const [name, setName] = useState(person.name)
  const [gender, setGender] = useState<Gender>(person.gender)
  const [dead, setDead] = useState(isDeceased(person))
  const stepParentId = spouseOfSingleParent(tree, person.id)
  const stepParent = stepParentId ? tree.members[stepParentId] : null
  const [alsoParent, setAlsoParent] = useState(false)
  const [form, setForm] = useState({
    birthDate: toDateInput(p.birthDate),
    deathDate: toDateInput(p.deathDate),
    birthPlace: p.birthPlace ?? '',
    maidenName: p.maidenName ?? '',
    city: p.city ?? '',
    country: p.country ?? '',
    job: p.job ?? '',
    comments: p.comments ?? '',
  })
  const [media, setMedia] = useState<StoredMedia[]>(p.media ?? [])
  const [titleUrl, setTitleUrl] = useState<string | null>(p.titleImageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const added = await uploadFiles(files)
      setMedia((m) => [...m, ...added])
      const firstImage = added.find((m) => m.kind === 'image')
      if (!titleUrl && firstImage) setTitleUrl(firstImage.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen.')
    } finally {
      setUploading(false)
    }
  }

  const removeMedia = (m: StoredMedia) => {
    setMedia((list) => list.filter((x) => x.id !== m.id))
    if (titleUrl === m.url) setTitleUrl(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const birthDate = parseDateInput(form.birthDate)
    // Ausgeschaltet: kein Sterbedatum (das Eingetippte bleibt nur bis zum Speichern im Feld)
    const deathDate = dead ? parseDateInput(form.deathDate) : null
    if (birthDate === undefined || deathDate === undefined) {
      return setError('Bitte Daten als TT.MM.JJJJ eingeben – oder nur Monat und Jahr (MM.JJJJ) oder nur das Jahr.')
    }
    // bei ungenauen Daten nur so genau vergleichen, wie beide bekannt sind
    const precision = Math.min(birthDate?.length ?? 0, deathDate?.length ?? 0)
    if (birthDate && deathDate && deathDate.slice(0, precision) < birthDate.slice(0, precision)) {
      return setError('Das Sterbedatum liegt vor dem Geburtsdatum.')
    }
    try {
      let next = updatePerson(tree, person.id, {
        name,
        gender,
        profile: {
          birthDate,
          deathDate,
          deceased: dead || undefined,
          birthPlace: form.birthPlace.trim() || null,
          maidenName: form.maidenName.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          job: form.job.trim() || null,
          comments: form.comments.trim() || null,
          titleImageUrl: titleUrl,
          media,
        },
      })
      if (stepParent && alsoParent) next = addExistingParent(next, person.id, stepParent.id)
      await commit(next)
      // Entfernte Dateien bleiben im Speicher, damit ältere gesicherte Stände ihre Bilder behalten.
      // Aufgeräumt wird in der täglichen Sicherung (scripts/daily-backup.mjs).
      notify({ message: 'Änderungen gespeichert.' })
      onDone()
    } catch (err) {
      if (err instanceof TreeConflictError) return
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-tour="edit-form">
      <h2 className="font-display text-[1.5rem] leading-tight text-ink">{person.name} bearbeiten</h2>

      <div>
        <label htmlFor="pf-name" className="field-label">
          Vor- und Nachname
        </label>
        <input
          id="pf-name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="words"
        />
      </div>

      <Segmented<Gender>
        label="Geschlecht"
        value={gender}
        onChange={setGender}
        options={[
          { value: 'MALE', label: 'Mann' },
          { value: 'FEMALE', label: 'Frau' },
        ]}
      />

      <Toggle checked={dead} onChange={setDead}>
        Ist verstorben
      </Toggle>

      {stepParent && (
        <Toggle checked={alsoParent} onChange={setAlsoParent}>
          {stepParent.name} ist auch {stepParent.gender === 'FEMALE' ? 'die Mutter' : 'der Vater'}
        </Toggle>
      )}

      <p className="-mb-2 text-sm text-ink-faint">
        Ist nur das Jahr bekannt, reicht z. B. „1822“.
        {dead && ' Ist das Sterbedatum unbekannt, bleibt das Feld einfach leer.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className={clsx(!dead && 'col-span-2')}>
          <label htmlFor="pf-born" className="field-label">
            Geboren
          </label>
          <input
            id="pf-born"
            className="field"
            value={form.birthDate}
            onChange={set('birthDate')}
            placeholder="TT.MM.JJJJ"
            autoComplete="off"
          />
        </div>
        {dead && (
          <div>
            <label htmlFor="pf-died" className="field-label">
              Gestorben
            </label>
            <input
              id="pf-died"
              className="field"
              value={form.deathDate}
              onChange={set('deathDate')}
              placeholder="unbekannt"
              autoComplete="off"
            />
          </div>
        )}
        <div>
          <label htmlFor="pf-birthplace" className="field-label">
            Geburtsort
          </label>
          <input id="pf-birthplace" className="field" value={form.birthPlace} onChange={set('birthPlace')} />
        </div>
        <div>
          <label htmlFor="pf-maiden" className="field-label">
            Geburtsname
          </label>
          <input id="pf-maiden" className="field" value={form.maidenName} onChange={set('maidenName')} />
        </div>
        <div>
          <label htmlFor="pf-city" className="field-label">
            Wohnort
          </label>
          <input id="pf-city" className="field" value={form.city} onChange={set('city')} />
        </div>
        <div>
          <label htmlFor="pf-country" className="field-label">
            Land
          </label>
          <input id="pf-country" className="field" value={form.country} onChange={set('country')} list="pf-countries" />
          <datalist id="pf-countries">
            {[
              'Deutschland',
              'Frankreich',
              'Luxemburg',
              'USA',
              'Österreich',
              'Schweiz',
              'Niederlande',
              'Belgien',
              'Italien',
              'Polen',
              'Spanien',
            ].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label htmlFor="pf-job" className="field-label">
          Beruf
        </label>
        <input id="pf-job" className="field" value={form.job} onChange={set('job')} />
      </div>

      <div>
        <label htmlFor="pf-notes" className="field-label">
          Notizen
        </label>
        <textarea
          id="pf-notes"
          className="field min-h-[9rem] resize-y leading-relaxed"
          value={form.comments}
          onChange={set('comments')}
          placeholder="Geschichten, Quellen, Hochzeit …"
        />
      </div>

      <section>
        <p className="field-label">Fotos und Dokumente</p>
        <ul className="grid grid-cols-3 gap-2">
          {media.map((m) => {
            const isTitle = m.url === titleUrl
            return (
              <li key={m.id} className="relative" data-tour="media-item">
                <div
                  className={clsx(
                    'aspect-square overflow-hidden rounded-control border bg-paper-raised',
                    isTitle ? 'border-gilt ring-2 ring-gilt' : 'border-card-rule',
                  )}
                >
                  {m.kind === 'image' ? (
                    <MediaImage src={m.url} alt={m.title ?? ''} lazy={false} />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-ink-muted">
                      <FileText className="h-6 w-6" />
                      <span className="line-clamp-2 break-all">{m.title ?? 'Datei'}</span>
                    </span>
                  )}
                </div>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  {m.kind === 'image' ? (
                    <button
                      type="button"
                      onClick={() => setTitleUrl(m.url)}
                      aria-label={isTitle ? 'Ist Profilbild' : 'Als Profilbild verwenden'}
                      title={isTitle ? 'Profilbild' : 'Als Profilbild verwenden'}
                      className={clsx(
                        'grid h-7 w-7 place-items-center rounded-full shadow',
                        isTitle ? 'bg-gilt text-linen-deep' : 'bg-card/90 text-ink-muted',
                      )}
                    >
                      <Star className="h-3.5 w-3.5" fill={isTitle ? 'currentColor' : 'none'} />
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(m)}
                    aria-label="Entfernen"
                    title="Entfernen"
                    className="grid h-7 w-7 place-items-center rounded-full bg-card/90 text-danger shadow"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              data-tour="add-photo"
              disabled={uploading}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line/70 text-sm text-ink-muted hover:border-linen hover:text-linen"
            >
              <ImagePlus className="h-6 w-6" />
              {uploading ? 'Lädt …' : 'Hinzufügen'}
            </button>
          </li>
        </ul>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            void onFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <p className="mt-1.5 text-sm text-ink-faint">Der Stern markiert das Profilbild im Baum.</p>
      </section>

      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        className="sticky bottom-0 -mx-5 flex gap-2 border-t border-card-rule bg-card/95 px-5 py-3 backdrop-blur"
        data-tour="form-actions"
      >
        <Button type="submit" variant="primary" disabled={saving || uploading} className="flex-1">
          {saving ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button variant="quiet" onClick={onDone} data-tour="form-cancel">
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
