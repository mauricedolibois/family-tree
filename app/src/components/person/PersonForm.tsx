// src/components/person/PersonForm.tsx
// Edit a person's details, including photos and documents.

import { useRef, useState } from 'react'
import clsx from 'clsx'
import { FileText, ImagePlus, Star, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
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
import { errorText } from '@/i18n/errors'
import { SUGGESTED_COUNTRIES, countryName } from '@/i18n/countries'
import { useI18n } from '@/i18n/I18nProvider'

export function PersonForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const { tree, treeId, commit, saving } = useFamily()
  const { notify } = useToast()
  const { t, locale } = useI18n()
  const p = person.profile ?? {}

  const [name, setName] = useState(person.name)
  const [gender, setGender] = useState<Gender>(person.gender)
  const [dead, setDead] = useState(isDeceased(person))
  const stepParentId = spouseOfSingleParent(tree, person.id)
  const stepParent = stepParentId ? tree.members[stepParentId] : null
  const [alsoParent, setAlsoParent] = useState(false)
  const [form, setForm] = useState({
    birthDate: toDateInput(p.birthDate, locale),
    deathDate: toDateInput(p.deathDate, locale),
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
      const added = await uploadFiles(treeId, files)
      setMedia((m) => [...m, ...added])
      const firstImage = added.find((m) => m.kind === 'image')
      if (!titleUrl && firstImage) setTitleUrl(firstImage.url)
    } catch (e) {
      setError(errorText(e, t, locale, t.errors.upload.failed))
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
    // Switched off: no date of death (anything typed only stays in the field until saving)
    const deathDate = dead ? parseDateInput(form.deathDate) : null
    if (birthDate === undefined || deathDate === undefined) {
      return setError(t.form.dateInvalid(t.format.datePlaceholder))
    }
    // with partial dates, compare only as precisely as both are known
    const precision = Math.min(birthDate?.length ?? 0, deathDate?.length ?? 0)
    if (birthDate && deathDate && deathDate.slice(0, precision) < birthDate.slice(0, precision)) {
      return setError(t.form.deathBeforeBirth)
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
      const undo = await commit(next)
      // Removed files stay in storage so older backups keep their images.
      // The daily backup job (scripts/daily-backup.mjs) cleans them up.
      notify({ message: t.form.saved, undo })
      onDone()
    } catch (err) {
      if (err instanceof TreeConflictError) return
      setError(errorText(err, t, locale, t.errors.saveFailed))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-tour="edit-form">
      <h2 className="font-display text-[1.5rem] leading-tight text-ink">{t.form.editTitle(person.name)}</h2>

      <div>
        <label htmlFor="pf-name" className="field-label">
          {t.form.fullName}
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
        label={t.form.gender}
        value={gender}
        onChange={setGender}
        options={[
          { value: 'MALE', label: t.form.man },
          { value: 'FEMALE', label: t.form.woman },
        ]}
      />

      <Toggle checked={dead} onChange={setDead}>
        {t.form.deceased}
      </Toggle>

      {stepParent && (
        <Toggle checked={alsoParent} onChange={setAlsoParent}>
          {t.form.alsoParent(stepParent.name, stepParent.gender === 'FEMALE')}
        </Toggle>
      )}

      <p className="-mb-2 text-sm text-ink-faint">
        {t.form.yearOnlyHint}
        {dead && t.form.deathUnknownHint}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className={clsx(!dead && 'col-span-2')}>
          <label htmlFor="pf-born" className="field-label">
            {t.person.born}
          </label>
          <input
            id="pf-born"
            className="field"
            value={form.birthDate}
            onChange={set('birthDate')}
            placeholder={t.format.datePlaceholder}
            autoComplete="off"
          />
        </div>
        {dead && (
          <div>
            <label htmlFor="pf-died" className="field-label">
              {t.person.died}
            </label>
            <input
              id="pf-died"
              className="field"
              value={form.deathDate}
              onChange={set('deathDate')}
              placeholder={t.form.unknown}
              autoComplete="off"
            />
          </div>
        )}
        <div>
          <label htmlFor="pf-birthplace" className="field-label">
            {t.form.birthPlace}
          </label>
          <input id="pf-birthplace" className="field" value={form.birthPlace} onChange={set('birthPlace')} />
        </div>
        <div>
          <label htmlFor="pf-maiden" className="field-label">
            {t.person.maidenName}
          </label>
          <input id="pf-maiden" className="field" value={form.maidenName} onChange={set('maidenName')} />
        </div>
        <div>
          <label htmlFor="pf-city" className="field-label">
            {t.person.city}
          </label>
          <input id="pf-city" className="field" value={form.city} onChange={set('city')} />
        </div>
        <div>
          <label htmlFor="pf-country" className="field-label">
            {t.person.country}
          </label>
          <input id="pf-country" className="field" value={form.country} onChange={set('country')} list="pf-countries" />
          <datalist id="pf-countries">
            {SUGGESTED_COUNTRIES.map((code) => (
              <option key={code} value={countryName(code, locale)} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label htmlFor="pf-job" className="field-label">
          {t.person.job}
        </label>
        <input id="pf-job" className="field" value={form.job} onChange={set('job')} />
      </div>

      <div>
        <label htmlFor="pf-notes" className="field-label">
          {t.person.notes}
        </label>
        <textarea
          id="pf-notes"
          className="field min-h-[9rem] resize-y leading-relaxed"
          value={form.comments}
          onChange={set('comments')}
          placeholder={t.form.notesPlaceholder}
        />
      </div>

      <section>
        <p className="field-label">{t.person.media}</p>
        <ul className="grid grid-cols-3 gap-2">
          {media.map((m) => {
            const isTitle = m.url === titleUrl
            return (
              <li key={m.id} className="relative" data-tour="media-item">
                <div
                  className={clsx(
                    'aspect-square overflow-hidden rounded-control border bg-canvas-raised',
                    isTitle ? 'border-accent ring-2 ring-accent' : 'border-card-rule',
                  )}
                >
                  {m.kind === 'image' ? (
                    <MediaImage src={m.url} alt={m.title ?? ''} lazy={false} />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-ink-muted">
                      <FileText className="h-6 w-6" />
                      <span className="line-clamp-2 break-all">{m.title ?? t.person.file}</span>
                    </span>
                  )}
                </div>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  {m.kind === 'image' ? (
                    <button
                      type="button"
                      onClick={() => setTitleUrl(m.url)}
                      aria-label={isTitle ? t.form.isProfilePhoto : t.form.useAsProfilePhoto}
                      title={isTitle ? t.form.profilePhoto : t.form.useAsProfilePhoto}
                      className={clsx(
                        'grid h-7 w-7 place-items-center rounded-full shadow',
                        isTitle ? 'bg-accent text-on-accent' : 'bg-card/90 text-ink-muted',
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
                    aria-label={t.form.removeFile}
                    title={t.form.removeFile}
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
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line/70 text-sm text-ink-muted hover:border-link hover:text-link"
            >
              {uploading ? <Spinner className="h-6 w-6" /> : <ImagePlus className="h-6 w-6" />}
              {uploading ? t.form.uploading : t.form.addFile}
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
        <p className="mt-1.5 text-sm text-ink-faint">{t.form.starHint}</p>
      </section>

      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Down to the panel's edge: with the scroller's bottom padding the form would show below the bar */}
      <div
        className="sticky -bottom-[max(1.5rem,env(safe-area-inset-bottom))] -mx-5 -mb-[max(1.5rem,env(safe-area-inset-bottom))] flex gap-2 border-t border-card-rule bg-card/95 px-5 pb-[calc(0.75rem+max(1.5rem,env(safe-area-inset-bottom)))] pt-3 backdrop-blur"
        data-tour="form-actions"
      >
        <Button type="submit" variant="primary" loading={saving} disabled={uploading} className="flex-1">
          {saving ? t.form.saving : t.form.save}
        </Button>
        <Button variant="quiet" onClick={onDone} data-tour="form-cancel">
          {t.form.cancel}
        </Button>
      </div>
    </form>
  )
}
