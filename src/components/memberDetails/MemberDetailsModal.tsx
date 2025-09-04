'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { useFamilyTree } from '@/components/FamilyTreeProvider'
import { useSelectedMember } from '@/components/SelectedMemberProvider'
import AddMember from '@/components/AddMember'
import {
  serializeFromRoot,
  type StoredTree,
  type StoredMedia,
} from '@/storage/schema'
import { IMember } from '@/types/IMember'
import { canDeleteStored, deleteLeafInStored, findByName } from './helpers'
import DetailsView from './DetailsView'
import EditView from './EditView'
import { serializeTagged } from '@/debug/serializeTagged'

export default function MemberDetailsModal() {
  const { root, applyStored, storedSnapshot } = useFamilyTree()
  const { selectedName, isDetailsOpen, closeDetails } = useSelectedMember()

  const member = useMemo<IMember | null>(
    () => findByName(root, selectedName),
    [root, selectedName]
  )
  const [mode, setMode] = useState<'details' | 'add' | 'edit'>('details')

  // Profil-Formstate
  const [form, setForm] = useState({
    birthDate: '',
    deathDate: '',
    country: '',
    city: '',
    comments: '',
    titleImageUrl: '',
  })
  const [pendingMedia, setPendingMedia] = useState<StoredMedia[]>([])
  const [pendingTitleUrl, setPendingTitleUrl] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)

  // Beim Personenwechsel Formular & Puffer zurücksetzen
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
  }, [member])

  // Darf gelöscht werden?
  const deletable = useMemo(() => {
    //const snap = storedSnapshot ?? serializeFromRoot(root, storedSnapshot ?? undefined)
    const snap = storedSnapshot ?? serializeTagged('Details-Save/Delete', root, storedSnapshot)
    return member ? canDeleteStored(snap, member.name) : false
  }, [member, root, storedSnapshot])

  const handleClose = () => {
    setMode('details')
    closeDetails()
  }

  // Persist + in State anwenden
  const putStored = async (stored: StoredTree) => {
    await fetch('/api/family', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stored),
    })
    applyStored(stored)
  }

 const handleSaveProfile = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!member) return

  try {
    const stored = serializeFromRoot(root, storedSnapshot ?? undefined)
    const rec = stored.members[member.name]

    const existing = rec.profile?.media ?? []
    const keptExisting = existing.filter((m) => !removedIds.has(m.id))
    const deletedExisting = existing.filter((m) => removedIds.has(m.id))

    // 1) Storage-Delete aufrufen (nur für bereits bestehende Medien)
    if (deletedExisting.length) {
      await fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: deletedExisting.map((m) => m.url) }),
      }).catch(() => {}) // Fehler nicht hart brechen lassen
    }

    // 2) Profil mit finaler Medienliste bauen
    rec.profile = {
      ...(rec.profile ?? {}),
      birthDate: form.birthDate || null,
      deathDate: form.deathDate || null,
      country: form.country || null,
      city: form.city || null,
      comments: form.comments || null,
      titleImageUrl: (pendingTitleUrl ?? form.titleImageUrl) || null,
      media: [...keptExisting, ...pendingMedia], // nur behalten + neue
    }

    // 3) Persist wie gehabt
    await putStored(stored)

    // UI-Buffer resetten
    setPendingMedia([])
    setPendingTitleUrl(null)
    setRemovedIds(new Set())
    setMode('details')
  } catch (err) {
    console.error(err)
    alert('Speichern fehlgeschlagen.')
  } 
}

  // Person löschen
  const handleDelete = async () => {
    if (!member || !deletable) return
    if (!window.confirm(`„${member.name}“ löschen?`)) return

    //const stored = serializeFromRoot(root, storedSnapshot ?? undefined)
    const stored = serializeTagged('Details-Delete', root, storedSnapshot)
    if (!deleteLeafInStored(stored, member.name)) {
      alert('Konnte Person nicht entfernen.')
      return
    }
    await putStored(stored)
    handleClose()
  }


  return (
  <Modal
    isOpen={isDetailsOpen}
    onClose={handleClose}
    title={member ? member.name : 'Details'}
  >
    <div className="w-full h-full px-2 sm:px-4">  {/* 👈 Padding-Wrapper */}
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