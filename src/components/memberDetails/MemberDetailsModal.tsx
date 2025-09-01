'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { useFamilyTree } from '@/components/FamilyTreeProvider'
import { useSelectedMember } from '@/components/SelectedMemberProvider'
import AddMember from '@/components/AddMember'
import { StoredMedia } from '@/storage/schema'
import { IMember } from '@/types/IMember'
import {
  serializeFromRoot,
  type StoredTree,
} from '@/storage/schema'
import { canDeleteStored, deleteLeafInStored, findByName } from './helpers'
import DetailsView from './DetailsView'
import EditView from './EditView'

export default function MemberDetailsModal() {
  const { root, applyStored, storedSnapshot } = useFamilyTree()
  const { selectedName, isDetailsOpen, closeDetails } = useSelectedMember()

  const member = useMemo(() => findByName(root, selectedName), [root, selectedName])
  const [mode, setMode] = useState<'details' | 'add' | 'edit'>('details')

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

  const deletable = useMemo(() => {
    const snap = storedSnapshot ?? serializeFromRoot(root, storedSnapshot ?? undefined)
    return member ? canDeleteStored(snap, member.name) : false
  }, [member, root, storedSnapshot])

  const handleClose = () => {
    setMode('details')
    closeDetails()
  }

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
    const stored = serializeFromRoot(root, storedSnapshot ?? undefined)
    const rec = stored.members[member.name]
    const keptExisting = (rec.profile?.media ?? []).filter((m) => !removedIds.has(m.id))
    rec.profile = {
      ...(rec.profile ?? {}),
      ...form,
      birthDate: form.birthDate || null,
      deathDate: form.deathDate || null,
      country: form.country || null,
      city: form.city || null,
      comments: form.comments || null,
      titleImageUrl: (pendingTitleUrl ?? form.titleImageUrl) || null,
      media: [...keptExisting, ...pendingMedia],
    }
    await putStored(stored)
    setPendingMedia([])
    setPendingTitleUrl(null)
    setRemovedIds(new Set())
    setMode('details')
  }

  const handleDelete = async () => {
    if (!member || !deletable) return
    if (!window.confirm(`„${member.name}“ löschen?`)) return
    const stored = serializeFromRoot(root, storedSnapshot ?? undefined)
    if (!deleteLeafInStored(stored, member.name)) {
      alert('Konnte Person nicht entfernen.')
      return
    }
    await putStored(stored)
    handleClose()
  }

  return (
    <Modal isOpen={isDetailsOpen} onClose={handleClose} title={member ? member.name : 'Details'}>
      {!member ? (
        <div>Mitglied nicht gefunden.</div>
      ) : mode === 'add' ? (
        <AddMember
          member={member}
          onSubmit={async () => {
            const fresh = serializeFromRoot(root, storedSnapshot ?? undefined)
            await putStored(fresh)
            setMode('details')
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
    </Modal>
  )
}
