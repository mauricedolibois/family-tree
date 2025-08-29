// src/components/MemberDetailsModal.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { useFamilyTree } from './FamilyTreeProvider'
import { useSelectedMember } from './SelectedMemberProvider'
import AddMember from './AddMember'
import { IMember } from '../types/IMember'
import { Gender } from '../types/Gender'
import {
  serializeFromRoot,
  type StoredTree,
  type StoredMember,
  type StoredMedia,
  type MediaKind,
} from '../storage/schema'
import { Button } from '@zendeskgarden/react-buttons'

/* ---------------- Helpers ---------------- */

function findByName(root: IMember | null, name: string | null): IMember | null {
  if (!root || !name) return null
  if (root.name === name) return root
  if (root.spouse?.name === name) return root.spouse
  for (const c of root.children ?? []) {
    const hit = findByName(c, name)
    if (hit) return hit
  }
  return null
}

function findParentName(stored: StoredTree, childName: string): string | null {
  for (const m of Object.values(stored.members)) {
    if (m.childrenNames?.includes(childName)) return m.name
  }
  return null
}

function coupleHasChildrenStored(stored: StoredTree, m: StoredMember): boolean {
  if ((m.childrenNames?.length ?? 0) > 0) return true
  if (m.spouseName) {
    const spouse = stored.members[m.spouseName]
    if (spouse && (spouse.childrenNames?.length ?? 0) > 0) return true
  }
  return false
}

function canDeleteStored(stored: StoredTree, targetName: string): boolean {
  if (targetName === stored.rootName) return false
  const t = stored.members[targetName]
  if (!t) return false
  if ((t.childrenNames?.length ?? 0) > 0) return false
  if (t.spouseName && coupleHasChildrenStored(stored, t)) return false
  return true
}

function deleteLeafInStored(stored: StoredTree, targetName: string): boolean {
  const t = stored.members[targetName]
  if (!t) return false
  if (t.spouseName) {
    const spouse = stored.members[t.spouseName]
    if (spouse && spouse.spouseName === t.name) spouse.spouseName = null
    t.spouseName = null
  }
  const parentName = findParentName(stored, targetName)
  if (parentName) {
    const p = stored.members[parentName]
    if (p && p.childrenNames) {
      p.childrenNames = p.childrenNames.filter((n) => n !== targetName)
    }
  }
  delete stored.members[targetName]
  return true
}

const inferKind = (file: File): MediaKind => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  return 'other'
}
const newId = () => Math.random().toString(36).slice(2)

/** Dateiname/Label aus title oder URL extrahieren */
function fileLabel(m: StoredMedia): string {
  if (m.title && m.title.trim()) return m.title.trim()
  try {
    const u = new URL(
      m.url,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost',
    )
    const path = u.pathname
    const base = path.substring(path.lastIndexOf('/') + 1)
    return decodeURIComponent(base)
  } catch {
    const parts = m.url.split('?')[0].split('#')[0].split('/')
    return decodeURIComponent(parts[parts.length - 1] || m.url)
  }
}

/* ------------- Tiny UI helpers ------------- */

function ChipButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
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
function ChipDangerButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
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

/* ---------------- Component ---------------- */

export default function MemberDetailsModal() {
  const { root, applyStored, storedSnapshot } = useFamilyTree()
  const { selectedName, isDetailsOpen, closeDetails } = useSelectedMember()

  const member = useMemo(
    () => findByName(root, selectedName),
    [root, selectedName],
  )
  const spouse = member?.spouse ?? null
  const children = member?.children ?? []

  const [mode, setMode] = useState<'details' | 'add' | 'edit'>('details')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Formularfelder
  const [form, setForm] = useState({
    birthDate: '',
    deathDate: '',
    country: '',
    city: '',
    comments: '',
    titleImageUrl: '',
  })

  // Pending-Änderungen (lokaler Puffer während Edit)
  const [pendingMedia, setPendingMedia] = useState<StoredMedia[]>([])
  const [pendingTitleUrl, setPendingTitleUrl] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  // Beim Wechsel der Person: Formular & Puffer zurücksetzen
  useEffect(() => {
    setMode('details')
    setForm({
      birthDate: member?.profile?.birthDate ?? '',
      deathDate: member?.profile?.deathDate ?? '',
      country: member?.profile?.country ?? '',
      city: member?.profile?.city ?? '',
      comments: member?.profile?.comments ?? '',
      titleImageUrl: member?.profile?.titleImageUrl ?? '',
    })
    setPendingMedia([])
    setPendingTitleUrl(null)
    setRemovedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member])

  // Bestehende Medien + kombinierte Vorschau im Edit-Modus
  const existingMedia = useMemo(
    () => member?.profile?.media ?? [],
    [member], // oder [member?.profile?.media, member]
  )
  const combinedMedia = useMemo(() => {
    const kept = existingMedia.filter((m) => !removedIds.has(m.id))
    return [...kept, ...pendingMedia]
  }, [existingMedia, pendingMedia, removedIds])

  // Delete-Guard
  const deletable = useMemo(() => {
    const snap = storedSnapshot
      ? storedSnapshot
      : serializeFromRoot(root, storedSnapshot ?? undefined)
    return member ? canDeleteStored(snap, member.name) : false
  }, [member, root, storedSnapshot])

  const handleClose = () => {
    setMode('details')
    closeDetails()
  }

  // PUT & apply in einem Schritt
  const putStored = async (stored: StoredTree) => {
    await fetch('/api/family', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stored),
    })
    applyStored(stored)
  }

  /* -------- Save Profile (inkl. Medien & Titelbild) -------- */
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return
    setSaving(true)
    try {
      const stored = serializeFromRoot(root, storedSnapshot ?? undefined)
      const rec = stored.members[member.name]

      const keptExisting = (rec.profile?.media ?? []).filter(
        (m) => !removedIds.has(m.id),
      )
      const finalMedia = [...keptExisting, ...pendingMedia]

      rec.profile = {
        ...(rec.profile ?? {}),
        birthDate: form.birthDate || null,
        deathDate: form.deathDate || null,
        country: form.country || null,
        city: form.city || null,
        comments: form.comments || null,
        titleImageUrl: (pendingTitleUrl ?? form.titleImageUrl) || null,
        media: finalMedia,
      }

      await putStored(stored)

      setPendingMedia([])
      setPendingTitleUrl(null)
      setRemovedIds(new Set())
      setMode('details')
    } catch (e) {
      console.error(e)
      alert('Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  /* -------- Delete Person -------- */
  const handleDelete = async () => {
    if (!member || !deletable) return
    const confirmMsg = member.spouse
      ? `„${member.name}“ ist verheiratet. Da das Paar keine Kinder hat, wird die Ehe gelöst und „${member.name}“ entfernt. Fortfahren?`
      : `„${member.name}“ löschen? Dies kann nicht rückgängig gemacht werden.`
    if (!window.confirm(confirmMsg)) return

    const stored = serializeFromRoot(root, storedSnapshot ?? undefined)
    if (!deleteLeafInStored(stored, member.name)) {
      alert('Konnte Person nicht entfernen.')
      return
    }
    await putStored(stored)
    handleClose()
  }

  /* -------- Upload: puffern, nicht sofort speichern -------- */
  const onFilesChosen = async (files: File[], setAsTitle = false) => {
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('file', f) // multiples
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

  // Inputs & DnD
  const titleInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
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
  const [dragOver, setDragOver] = useState(false)
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

  // Edit-Operationen auf gepufferten Medien
  const unstagePending = (id: string) =>
    setPendingMedia((prev) => prev.filter((m) => m.id !== id))
  const setTitleFromMedia = (url: string) => setPendingTitleUrl(url)

  // Titelbild-Vorschau im Edit
  const previewTitle =
    pendingTitleUrl ??
    form.titleImageUrl ??
    member?.profile?.titleImageUrl ??
    ''

  return (
    <Modal
      isOpen={isDetailsOpen}
      onClose={handleClose}
      title={member ? member.name : 'Details'}
    >
      {!member ? (
        <div>Mitglied nicht gefunden.</div>
      ) : mode === 'add' ? (
        <div className="flex flex-col gap-3">
          <AddMember
            member={member}
            onSubmit={async () => {
              const fresh = serializeFromRoot(root, storedSnapshot ?? undefined)
              await putStored(fresh)
              setMode('details')
            }}
          />
          <div className="pt-2">
            <Button onClick={() => setMode('details')}>
              Zurück zu Details
            </Button>
          </div>
        </div>
      ) : mode === 'edit' ? (
        <form className="flex flex-col gap-5" onSubmit={handleSaveProfile}>
          {/* REIHE: Titelbild (links) + Felder (rechts) */}
          <div className="grid grid-cols-[auto,1fr] gap-4 items-start">
            {/* Titelbild – 3:4, klein */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden w-32">
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
                  <ChipButton onClick={openTitlePicker}>
                    Titelbild ändern
                  </ChipButton>
                </div>
              </div>
            </div>

            {/* Felder rechts daneben */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                Geburtsdatum
                <input
                  type="date"
                  className="border rounded-lg p-2 w-full"
                  value={form.birthDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, birthDate: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Todesdatum
                <input
                  type="date"
                  className="border rounded-lg p-2 w-full"
                  value={form.deathDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deathDate: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Land
                <input
                  className="border rounded-lg p-2 w-full"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Wohnort
                <input
                  className="border rounded-lg p-2 w-full"
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Kommentare
                <textarea
                  className="border rounded-lg p-2 w-full"
                  rows={3}
                  value={form.comments}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, comments: e.target.value }))
                  }
                />
              </label>
            </div>
          </div>

          {/* Drag&Drop Medien */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
              dragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 bg-white'
            }`}
          >
            <p className="text-sm text-gray-600">
              Dateien hierher ziehen (Bilder, Videos, PDFs) oder{' '}
              <button
                type="button"
                onClick={openMediaPicker}
                className="underline"
              >
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

          {/* Medien-Verwaltung im Edit-Modus – Scroll-Container */}
          <div className="max-h-[25vh] overflow-y-auto pr-1">
            <EditableMediaGallery
              media={combinedMedia}
              onSetTitle={(url) => setTitleFromMedia(url)}
              onRemove={(id) => {
                if (pendingMedia.some((m) => m.id === id)) {
                  unstagePending(id)
                } else {
                  setRemovedIds((prev) => {
                    const arr = Array.from(prev)
                    arr.push(id)
                    return new Set(arr)
                  })
                }
              }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button isPrimary type="submit" disabled={saving}>
              {saving ? 'Speichern…' : 'Speichern'}
            </Button>
            <Button onClick={() => setMode('details')}>Abbrechen</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-5 text-left">
          {/* REIHE: Titelbild + Infos */}
          <div className="grid grid-cols-[auto,1fr] gap-4 items-start">
            {/* Titelbild – 3:4, klein */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden w-32">
              <div className="relative aspect-[3/4] bg-gray-100">
                {member.profile?.titleImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.profile.titleImageUrl}
                    alt={`${member.name} Titelbild`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                    Kein Titelbild
                  </div>
                )}
              </div>
            </div>

            {/* Infos rechts daneben */}
            <div className="text-sm text-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6">
              <div>
                <span className="font-medium">Geschlecht:</span>{' '}
                {member.gender === Gender.MALE ? 'männlich' : 'weiblich'}
              </div>
              <div>
                <span className="font-medium">Ehepartner:</span>{' '}
                {spouse ? spouse.name : '—'}
              </div>
              <div>
                <span className="font-medium">Kinder:</span>{' '}
                {children.length ? children.map((c) => c.name).join(', ') : '—'}
              </div>
              <div>
                <span className="font-medium">Geburtsdatum:</span>{' '}
                {member.profile?.birthDate || '—'}
              </div>
              <div>
                <span className="font-medium">Todesdatum:</span>{' '}
                {member.profile?.deathDate || '—'}
              </div>
              <div>
                <span className="font-medium">Land:</span>{' '}
                {member.profile?.country || '—'}
              </div>
              <div>
                <span className="font-medium">Wohnort:</span>{' '}
                {member.profile?.city || '—'}
              </div>
              <div className="sm:col-span-2">
                <span className="font-medium">Kommentare:</span>{' '}
                {member.profile?.comments || '—'}
              </div>
            </div>
          </div>

          {/* Medien read-only (anklickbar, mit Dateinamen) */}
          <ReadOnlyMediaGallery media={existingMedia} />

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => setMode('edit')}>Bearbeiten</Button>
            <Button isPrimary onClick={() => setMode('add')}>
              Person hinzufügen
            </Button>
            <Button
              isDanger
              disabled={!deletable}
              onClick={handleDelete}
              title={
                !deletable
                  ? 'Nur kinderlose Personen (und nicht Root). Paare mit Kindern sind geschützt.'
                  : undefined
              }
            >
              Person löschen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------------- Media UI ---------------- */

function MediaCardClickable({ media }: { media: StoredMedia }) {
  const label = fileLabel(media)
  const content = (
    <div className="relative w-full h-28 bg-gray-100 flex items-center justify-center">
      {media.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={label}
          className="w-full h-full object-cover"
        />
      ) : media.kind === 'video' ? (
        <video
          src={media.url}
          className="w-full h-full object-cover"
          controls
        />
      ) : media.kind === 'pdf' ? (
        <div className="flex items-center justify-center text-xs text-gray-700">
          PDF
        </div>
      ) : (
        <div className="flex items-center justify-center text-xs text-gray-700">
          Datei
        </div>
      )}
    </div>
  )

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      <a href={media.url} target="_blank" rel="noreferrer" title="Öffnen">
        {content}
      </a>
      <div className="px-2 py-2 text-xs text-gray-700 truncate" title={label}>
        {label}
      </div>
    </div>
  )
}

function ReadOnlyMediaGallery({ media }: { media: StoredMedia[] }) {
  if (!media.length)
    return <div className="text-sm text-gray-500">Keine Medien vorhanden.</div>
  return (
    <div>
      <div className="text-sm font-medium mb-1">Medien</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {media.map((m) => (
          <MediaCardClickable key={m.id} media={m} />
        ))}
      </div>
    </div>
  )
}

function EditableMediaGallery({
  media,
  onSetTitle,
  onRemove,
}: {
  media: StoredMedia[]
  onSetTitle: (url: string) => void
  onRemove: (id: string) => void
}) {
  if (!media.length)
    return (
      <div className="text-sm text-gray-500">
        Noch keine Medien hinzugefügt.
      </div>
    )
  return (
    <div>
      <div className="text-sm font-medium mb-1">
        Medien (Änderungen werden beim Speichern übernommen)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {media.map((m) => {
          const label = fileLabel(m)
          const preview =
            m.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.url}
                alt={label}
                className="w-full h-full object-cover"
              />
            ) : m.kind === 'video' ? (
              <video
                src={m.url}
                className="w-full h-full object-cover"
                controls
              />
            ) : m.kind === 'pdf' ? (
              <div className="flex items-center justify-center text-xs text-gray-700">
                PDF
              </div>
            ) : (
              <div className="flex items-center justify-center text-xs text-gray-700">
                Datei
              </div>
            )

          return (
            <div
              key={m.id}
              className="border rounded-xl overflow-hidden bg-white shadow-sm flex flex-col"
            >
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                title="Öffnen"
                className="relative w-full h-28 bg-gray-100 flex items-center justify-center"
              >
                {preview}
              </a>
              <div
                className="px-2 py-2 text-xs text-gray-700 truncate"
                title={label}
              >
                {label}
              </div>

              {/* kompakte, wrap-bare Action-Leiste */}
              <div className="px-2 pb-2 flex flex-wrap items-center gap-1">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                >
                  Öffnen
                </a>
                {m.kind === 'image' && (
                  <ChipButton onClick={() => onSetTitle(m.url)}>
                    Als Titelbild
                  </ChipButton>
                )}
                <ChipDangerButton
                  className="ml-auto"
                  onClick={() => onRemove(m.id!)}
                >
                  Entfernen
                </ChipDangerButton>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
