// src/components/memberDetails/MemberDetailsModal.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { TreeConflictError, useFamilyTree } from '@/components/FamilyTreeProvider'
import { useSelectedMember } from '@/components/SelectedMemberProvider'
import AddMember from '@/components/AddMember'
import {
  serializeFromRoot,
  type StoredTree,
  type StoredMedia,
} from '@/storage/schema'
import type { IMember } from '@/types/IMember'
import { canDeleteStoredById, deleteMemberSafeInStored } from './helpers'
import DetailsView from './DetailsView'
import EditView from './EditView'

export default function MemberDetailsModal() {
  // getById neu aus dem Provider ziehen
  const { root, commit, storedSnapshot, getById } = useFamilyTree()
  const { selectedId, isDetailsOpen, closeDetails } = useSelectedMember()

  // Person immer per ID über den globalen Index suchen
  const member = useMemo<IMember | null>(() => {
    if (!selectedId) return null
    return getById(selectedId)
  }, [getById, selectedId])

  const [mode, setMode] = useState<'details' | 'add' | 'edit'>('details')

  // Profil-Formstate
  const [form, setForm] = useState({
    birthDate: '',
    deathDate: '',
    country: '',
    city: '',
    job: '',
    comments: '',
    titleImageUrl: '',
  })
  const [pendingMedia, setPendingMedia] = useState<StoredMedia[]>([])
  const [pendingTitleUrl, setPendingTitleUrl] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)

  // Beim Personenwechsel Formular & Buffer zurücksetzen
  useEffect(() => {
    setMode('details')
    setForm({
      birthDate: member?.profile?.birthDate ?? '',
      deathDate: member?.profile?.deathDate ?? '',
      country: member?.profile?.country ?? '',
      city: member?.profile?.city ?? '',
      job: member?.profile?.job ?? '',
      comments: member?.profile?.comments ?? '',
      titleImageUrl: member?.profile?.titleImageUrl ?? '',
    })
    setPendingMedia([])
    setPendingTitleUrl(null)
    setRemovedIds(new Set())
  }, [member])

  // Einheitliche Lösch-Policy (oben/Root erlauben, Kinder an Spouse hängen, Spouse als neue Root bevorzugen)
  const deletePolicy = useMemo(
    () => ({
      allowTopDeletion: true,
      allowRootDeletion: true,
      orphanStrategy: 'relinkToSpouse' as const,
      preferNewRoot: 'spouse' as const,
    }),
    []
  )

  // Löschbarkeit prüfen → v3, ID-basiert, mit neuer Policy
  const deletable = useMemo(() => {
    if (!member) return false
    const snap: StoredTree =
      storedSnapshot?.version === 3
        ? storedSnapshot
        : serializeFromRoot(root, storedSnapshot ?? null)
    return canDeleteStoredById(snap, member.id, deletePolicy)
  }, [member, root, storedSnapshot, deletePolicy])

  const handleClose = () => {
    setMode('details')
    closeDetails()
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return

    try {
      // serializeFromRoot erzeugt v3 (ID-basiert)
      const stored = serializeFromRoot(root, storedSnapshot ?? null)
      const rec = stored.members[member.id]
      if (!rec) throw new Error('Datensatz nicht gefunden')

      const existing = rec.profile?.media ?? []
      const keptExisting = existing.filter((m) => !removedIds.has(m.id))
      const deletedExisting = existing.filter((m) => removedIds.has(m.id))

      // Profil aktualisieren
      rec.profile = {
        ...(rec.profile ?? {}),
        birthDate: form.birthDate || null,
        deathDate: form.deathDate || null,
        country: form.country || null,
        city: form.city || null,
        job: form.job || null,
        comments: form.comments || null,
        titleImageUrl: (pendingTitleUrl ?? form.titleImageUrl) || null,
        media: [...keptExisting, ...pendingMedia],
      }

      await commit(stored)

      // Entfernte Medien erst löschen, wenn der neue Stand sicher gespeichert ist
      if (deletedExisting.length) {
        await fetch('/api/media/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: deletedExisting.map((m) => m.url) }),
        }).catch(() => {})
      }

      // UI-Buffer resetten
      setPendingMedia([])
      setPendingTitleUrl(null)
      setRemovedIds(new Set())
      setMode('details')
    } catch (err) {
      console.error(err)
      if (!(err instanceof TreeConflictError)) alert('Speichern fehlgeschlagen.')
    }
  }

  // Person löschen → ID-basiert (mit sicherer Top-/Root-Deletion)
  const handleDelete = async () => {
    if (!member || !deletable) return
    if (!window.confirm(`„${member.name}“ löschen?`)) return

    const stored = serializeFromRoot(root, storedSnapshot ?? null)

    const ok = deleteMemberSafeInStored(stored, member.id, deletePolicy)
    if (!ok) {
      alert('Konnte Person nicht entfernen.')
      return
    }

    try {
      await commit(stored)
      handleClose()
    } catch (err) {
      console.error(err)
      if (!(err instanceof TreeConflictError)) alert('Löschen fehlgeschlagen.')
    }
  }

  return (
    <Modal
      isOpen={isDetailsOpen}
      onClose={handleClose}
      title={member ? member.name : 'Details'}
    >
      <div className="w-full h-full px-2 sm:px-4">
        {!member ? (
          <div>Mitglied nicht gefunden.</div>
        ) : mode === 'add' ? (
          <AddMember
            member={member}
            onSubmit={() => {
              setMode('details')
              closeDetails()
            }}
          />
        ) : mode === 'edit' ? (
          <EditView
            member={member}
            form={form}
            setForm={setForm}
            pendingMedia={pendingMedia}
            setPendingMedia={setPendingMedia}
            removedIds={removedIds}
            setRemovedIds={setRemovedIds}
            pendingTitleUrl={pendingTitleUrl}
            setPendingTitleUrl={setPendingTitleUrl}
            uploading={uploading}
            setUploading={setUploading}
            onSave={handleSaveProfile}
            onCancel={() => setMode('details')}
          />
        ) : (
          <DetailsView
            member={member}
            deletable={deletable}
            onEdit={() => setMode('edit')}
            onAdd={() => setMode('add')}
            onDelete={handleDelete}
          />
        )}
      </div>
    </Modal>
  )
}
