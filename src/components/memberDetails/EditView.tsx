// src/components/memberDetails/EditView.tsx
'use client'

import React, { useRef, useState } from 'react'
import { IMember } from '@/types/IMember'
import { Button } from '@zendeskgarden/react-buttons'
import EditableMediaGallery from './EditableMediaGallery'
import { ChipButton } from './ChipButtons'
import { inferKind, newId } from './helpers'
import { StoredMedia } from '@/storage/schema'

type FormState = {
  birthDate: string
  deathDate: string
  country: string
  city: string
  job: string        // 👈 neu
  comments: string
  titleImageUrl: string
}

type Props = {
  member: IMember
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  pendingMedia: StoredMedia[]
  setPendingMedia: React.Dispatch<React.SetStateAction<StoredMedia[]>>
  removedIds: Set<string>
  setRemovedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  pendingTitleUrl: string | null
  setPendingTitleUrl: React.Dispatch<React.SetStateAction<string | null>>
  uploading: boolean
  setUploading: React.Dispatch<React.SetStateAction<boolean>>
  onSave: (e: React.FormEvent) => Promise<void>
  onCancel: () => void
}

export default function EditView({
  member,
  form,
  setForm,
  pendingMedia,
  setPendingMedia,
  removedIds,
  setRemovedIds,
  pendingTitleUrl,
  setPendingTitleUrl,
  uploading,
  setUploading,
  onSave,
  onCancel,
}: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const openTitlePicker = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    titleInputRef.current?.click()
  }
  const openMediaPicker = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    mediaInputRef.current?.click()
  }

  const handleTitlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    onFilesChosen(files, true)
    e.currentTarget.value = ''
  }
  const handleMediaPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    onFilesChosen(files, false)
    e.currentTarget.value = ''
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = (ev) => {
    ev.preventDefault()
    setDragOver(false)
    const files = Array.from(ev.dataTransfer.files ?? [])
    onFilesChosen(files, false)
  }
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (ev) => {
    ev.preventDefault()
    setDragOver(true)
  }
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = () =>
    setDragOver(false)

  const onFilesChosen = async (files: File[], setAsTitle = false) => {
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('file', f)
      const res = await fetch('/api/media', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { urls } = (await res.json()) as { urls: string[] }

      const uploaded: StoredMedia[] = urls.map((url, i) => ({
        id: newId(),
        url,
        kind: inferKind(files[i]),
        title: files[i].name,
        createdAt: new Date().toISOString(),
      }))
      setPendingMedia((prev) => prev.concat(uploaded))
      if (setAsTitle && urls[0]) setPendingTitleUrl(urls[0])
    } catch (e) {
      console.error(e)
      alert('Upload fehlgeschlagen.')
    } finally {
      setUploading(false)
    }
  }

  const unstagePending = (id: string) =>
    setPendingMedia((prev) => prev.filter((m) => m.id !== id))
  const setTitleFromMedia = (url: string) => setPendingTitleUrl(url)

  const previewTitle =
    pendingTitleUrl ?? form.titleImageUrl ?? member?.profile?.titleImageUrl ?? ''

  const combinedMedia = [
    ...(member.profile?.media ?? []).filter((m) => !removedIds.has(m.id)),
    ...pendingMedia,
  ]

  return (
    <form
      className="
        flex flex-col gap-6
        w-full max-w-3xl mx-auto
        px-2 sm:px-4
      "
      onSubmit={onSave}
    >
      {/* Sektion: Titelbild + Basisdaten */}
      <section
        className="
          rounded-2xl border border-[color:var(--color-primary-50)]
          bg-white shadow-sm p-4 sm:p-5
        "
      >
        <h3 className="text-base font-semibold mb-4 text-[color:var(--color-primary-900)]">
          Basisdaten
        </h3>

        <div className="grid grid-cols-[auto,1fr] gap-5 items-start">
          {/* Titelbild */}
          <div className="rounded-xl border bg-white overflow-hidden w-28 sm:w-32">
            <div className="relative aspect-[3/4] bg-gray-100">
              {previewTitle ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewTitle}
                  alt="Titelbild"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  Titelbild wählen
                </div>
              )}
              <div className="absolute bottom-2 right-2">
                <ChipButton onClick={openTitlePicker}>Titelbild ändern</ChipButton>
              </div>
            </div>
          </div>

          {/* Formfelder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm gap-1 flex flex-col">
              Geburtsdatum
              <input
                type="date"
                className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-[color:var(--color-primary)] outline-none"
                value={form.birthDate}
                onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
              />
            </label>

            <label className="text-sm gap-1 flex flex-col">
              Todesdatum
              <input
                type="date"
                className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-[color:var(--color-primary)] outline-none"
                value={form.deathDate}
                onChange={(e) => setForm((f) => ({ ...f, deathDate: e.target.value }))}
              />
            </label>

            <label className="text-sm gap-1 flex flex-col">
              Land
              <input
                className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-[color:var(--color-primary)] outline-none"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </label>

            <label className="text-sm gap-1 flex flex-col">
              Wohnort
              <input
                className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-[color:var(--color-primary)] outline-none"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>

            <label className="text-sm gap-1 flex flex-col">
              Beruf
              <input
                className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-[color:var(--color-primary)] outline-none"
                placeholder="z. B. Schreinerin, Lehrer, …"
                value={form.job}
                onChange={(e) => setForm((f) => ({ ...f, job: e.target.value }))}
              />
            </label>

            <label className="text-sm gap-1 flex flex-col">
              Kommentare
              <textarea
                className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-[color:var(--color-primary)] outline-none"
                rows={3}
                value={form.comments}
                onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
              />
            </label>
          </div>
        </div>
      </section>

      {/* Sektion: Medien Upload/Verwaltung */}
      <section
        className="
          rounded-2xl border border-[color:var(--color-primary-50)]
          bg-white shadow-sm p-4 sm:p-5
        "
      >
        <h3 className="text-base font-semibold mb-3 text-[color:var(--color-primary-900)]">
          Medien
        </h3>

        {/* Drag & Drop Fläche */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
            dragOver
              ? 'border-[color:var(--color-accent-100)] bg-[color:var(--color-surface-50)]'
              : 'border-gray-300 bg-white'
          }`}
        >
          <p className="text-sm text-gray-600">
            Dateien hierher ziehen (Bilder, Videos, PDFs) oder{' '}
            <button type="button" onClick={openMediaPicker} className="underline">
              auswählen
            </button>
          </p>
          {uploading && (
            <p className="text-xs text-gray-500 mt-2">Upload läuft…</p>
          )}
        </div>

        {/* Hidden Inputs */}
        <input
          ref={titleInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleTitlePicked}
        />
        <input
          ref={mediaInputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="hidden"
          onChange={handleMediaPicked}
        />

        {/* Medienverwaltung */}
        <div className="max-h-[25vh] overflow-y-auto pr-1 mt-4">
          <EditableMediaGallery
            media={combinedMedia}
            onSetTitle={setTitleFromMedia}
            onRemove={(id) => {
              if (pendingMedia.some((m) => m.id === id)) {
                unstagePending(id)
              } else {
                setRemovedIds((prev) => {
                  const next = new Set(prev)
                  next.add(id)
                  return next
                })
              }
            }}
          />
        </div>
      </section>

      {/* Aktionen */}
      <div className="flex gap-2 pt-1">
        <Button isPrimary type="submit">Speichern</Button>
        <Button onClick={onCancel}>Abbrechen</Button>
      </div>
    </form>
  )
}
