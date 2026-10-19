// src/components/person/PersonForm.tsx
// Angaben zu einer Person bearbeiten, inklusive Fotos und Dokumente.

import { useRef, useState } from 'react'
import clsx from 'clsx'
import { FileText, ImagePlus, Star, Trash2 } from 'lucide-react'
import type { Gender, Person } from '@/family/model'
import { EditError, updatePerson } from '@/family/edit'
import { isDeceased, parseDateInput, toDateInput } from '@/family/format'
import type { StoredMedia } from '@/storage/schema'
import { TreeConflictError, useFamily } from '@/components/app/FamilyProvider'
import { useToast } from '@/components/app/Toast'
import { Button } from '@/components/ui/Button'
import { Segmented, Toggle } from '@/components/ui/Choice'
import { MediaImage } from '@/components/ui/MediaImage'
import { uploadFiles } from './upload'
import { useLang } from '@/i18n/lang'

export function PersonForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const { tree, commit, saving } = useFamily()
  const { notify } = useToast()
  const { t, lang } = useLang()
  const p = person.profile ?? {}

  const [name, setName] = useState(person.name)
  const [gender, setGender] = useState<Gender>(person.gender)
  const [dead, setDead] = useState(isDeceased(person))
  const [form, setForm] = useState({
    birthDate: toDateInput(p.birthDate, lang),
    deathDate: toDateInput(p.deathDate, lang),
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
      const added = await uploadFiles(files, lang)
      setMedia((m) => [...m, ...added])
      const firstImage = added.find((m) => m.kind === 'image')
      if (!titleUrl && firstImage) setTitleUrl(firstImage.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Hochladen fehlgeschlagen.', 'Upload failed.'))
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
      return setError(
        t(
          'Bitte Daten als TT.MM.JJJJ eingeben – oder nur Monat und Jahr (MM.JJJJ) oder nur das Jahr.',
          'Please enter dates as MM/DD/YYYY – or just month and year (MM/YYYY) or just the year.',
        ),
      )
    }
    // bei ungenauen Daten nur so genau vergleichen, wie beide bekannt sind
    const precision = Math.min(birthDate?.length ?? 0, deathDate?.length ?? 0)
    if (birthDate && deathDate && deathDate.slice(0, precision) < birthDate.slice(0, precision)) {
      return setError(
        t('Das Sterbedatum liegt vor dem Geburtsdatum.', 'The date of death is before the date of birth.'),
      )
    }
    try {
      const next = updatePerson(tree, person.id, {
        name,
        gender,
        profile: {
          birthDate,
          deathDate,
          deceased: dead || undefined,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          job: form.job.trim() || null,
          comments: form.comments.trim() || null,
          titleImageUrl: titleUrl,
          media,
        },
      })
      await commit(next)
      // Entfernte Dateien bleiben im Speicher, damit ältere gesicherte Stände ihre Bilder behalten.
      // Aufgeräumt wird in der täglichen Sicherung (scripts/daily-backup.mjs).
      notify({ message: t('Änderungen gespeichert.', 'Changes saved.') })
      onDone()
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
    <form onSubmit={submit} className="flex flex-col gap-5" data-tour="edit-form">
      <h2 className="font-display text-[1.5rem] leading-tight text-ink">
        {t(`${person.name} bearbeiten`, `Edit ${person.name}`)}
      </h2>

      <div>
        <label htmlFor="pf-name" className="field-label">
          {t('Vor- und Nachname', 'First and last name')}
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
        label={t('Geschlecht', 'Gender')}
        value={gender}
        onChange={setGender}
        options={[
          { value: 'MALE', label: t('Mann', 'Male') },
          { value: 'FEMALE', label: t('Frau', 'Female') },
        ]}
      />

      <Toggle checked={dead} onChange={setDead}>
        {t('Ist verstorben', 'Deceased')}
      </Toggle>

      <p className="-mb-2 text-sm text-ink-faint">
        {t('Ist nur das Jahr bekannt, reicht z. B. „1822“.', 'If only the year is known, “1822” is enough.')}
        {dead &&
          t(
            ' Ist das Sterbedatum unbekannt, bleibt das Feld einfach leer.',
            ' If the date of death is unknown, just leave it empty.',
          )}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className={clsx(!dead && 'col-span-2')}>
          <label htmlFor="pf-born" className="field-label">
            {t('Geboren', 'Born')}
          </label>
          <input
            id="pf-born"
            className="field"
            value={form.birthDate}
            onChange={set('birthDate')}
            placeholder={t('TT.MM.JJJJ', 'MM/DD/YYYY')}
            autoComplete="off"
          />
        </div>
        {dead && (
          <div>
            <label htmlFor="pf-died" className="field-label">
              {t('Gestorben', 'Died')}
            </label>
            <input
              id="pf-died"
              className="field"
              value={form.deathDate}
              onChange={set('deathDate')}
              placeholder={t('unbekannt', 'unknown')}
              autoComplete="off"
            />
          </div>
        )}
        <div>
          <label htmlFor="pf-city" className="field-label">
            {t('Wohnort', 'Lives in')}
          </label>
          <input id="pf-city" className="field" value={form.city} onChange={set('city')} />
        </div>
        <div>
          <label htmlFor="pf-country" className="field-label">
            {t('Land', 'Country')}
          </label>
          <input id="pf-country" className="field" value={form.country} onChange={set('country')} list="pf-countries" />
          <datalist id="pf-countries">
            {(lang === 'en'
              ? [
                  'USA',
                  'Germany',
                  'France',
                  'Luxembourg',
                  'Austria',
                  'Switzerland',
                  'Netherlands',
                  'Belgium',
                  'Italy',
                  'Poland',
                ]
              : [
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
                ]
            ).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label htmlFor="pf-job" className="field-label">
          {t('Beruf', 'Occupation')}
        </label>
        <input id="pf-job" className="field" value={form.job} onChange={set('job')} />
      </div>

      <div>
        <label htmlFor="pf-notes" className="field-label">
          {t('Notizen', 'Notes')}
        </label>
        <textarea
          id="pf-notes"
          className="field min-h-[9rem] resize-y leading-relaxed"
          value={form.comments}
          onChange={set('comments')}
          placeholder={t('Geschichten, Quellen, Geburtsort, Hochzeit …', 'Stories, sources, place of birth, wedding …')}
        />
      </div>

      <section>
        <p className="field-label">{t('Fotos und Dokumente', 'Photos and documents')}</p>
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
                      <span className="line-clamp-2 break-all">{m.title ?? t('Datei', 'File')}</span>
                    </span>
                  )}
                </div>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  {m.kind === 'image' ? (
                    <button
                      type="button"
                      onClick={() => setTitleUrl(m.url)}
                      aria-label={
                        isTitle
                          ? t('Ist Profilbild', 'Is profile picture')
                          : t('Als Profilbild verwenden', 'Use as profile picture')
                      }
                      title={
                        isTitle
                          ? t('Profilbild', 'Profile picture')
                          : t('Als Profilbild verwenden', 'Use as profile picture')
                      }
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
                    aria-label={t('Entfernen', 'Remove')}
                    title={t('Entfernen', 'Remove')}
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
              {uploading ? t('Lädt …', 'Uploading …') : t('Hinzufügen', 'Add')}
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
        <p className="mt-1.5 text-sm text-ink-faint">
          {t('Der Stern markiert das Profilbild im Baum.', 'The star marks the profile picture in the tree.')}
        </p>
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
          {saving ? t('Wird gespeichert …', 'Saving …') : t('Speichern', 'Save')}
        </Button>
        <Button variant="quiet" onClick={onDone} data-tour="form-cancel">
          {t('Abbrechen', 'Cancel')}
        </Button>
      </div>
    </form>
  )
}
