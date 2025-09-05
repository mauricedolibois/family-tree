// src/components/AddMember.tsx
'use client'

import { FormEvent, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import { AllowedRelationship } from '@/types/Relationship'
import { useFamilyTree } from '@/components/FamilyTreeProvider'
import { serializeFromRoot } from '@/storage/schema'
import { Button } from '@zendeskgarden/react-buttons'

interface AddMemberProps {
  onSubmit: () => void
  member: IMember
  isOpen?: boolean
}

export default function AddMember({ onSubmit, member, isOpen = true }: AddMemberProps) {
  const [newMember, setNewMember] = useState<string>('')

  const [relationship, setRelationship] = useState<AllowedRelationship>('CHILD')
  const [gender, setGender] = useState<Gender>(Gender.MALE)

  // Flags (werden später für Optionen wie Adoption/Ehe genutzt)
  const [isAdopted, setIsAdopted] = useState<boolean>(false) // nur bei CHILD
  const [marriedToExistingParent, setMarriedToExistingParent] = useState<boolean>(true) // nur bei PARENT

  const { familyTree, applyStored, storedSnapshot } = useFamilyTree()

  const canSubmit = useMemo(
    () => newMember.trim().length > 0 && !!relationship && gender !== undefined,
    [newMember, relationship, gender]
  )

  const handleAddMember = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = newMember.trim()
    if (!name) return

    try {
      // ID-basierte Anlage
      if (relationship === 'PARENT') {
        // ⬇️ NEU: Options-Objekt weitergeben (wird im FamilyTree/mutations verarbeitet)
        familyTree.addMemberById(member.id, name, gender, relationship, {
          marryExistingParent: marriedToExistingParent,
          // adopt: isAdopted, // <- später nutzbar, wenn Adoption modelliert ist
        })
      } else {
        familyTree.addMemberById(member.id, name, gender, relationship)
      }

      const stored = serializeFromRoot(familyTree.root, storedSnapshot)
      applyStored(stored)
      onSubmit()
    } catch (err: any) {
      console.error('[UI] addMember ERROR', err)
      alert(err?.message ?? String(err) ?? 'Something went wrong')
    }
  }

  const onRelationshipChange = (value: AllowedRelationship) => {
    setRelationship(value)
    if (value !== 'CHILD') setIsAdopted(false)
    if (value !== 'PARENT') setMarriedToExistingParent(true)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onSubmit}
      title="Neues Familienmitglied hinzufügen"
    >
      <form
        className="
          w-full max-w-3xl mx-auto
          px-2 sm:px-4 py-1
          flex flex-col gap-5
          text-[color:var(--color-primary-800)]
        "
        onSubmit={handleAddMember}
        role="form"
      >
        {/* Kontextinfo */}
        <div
          className="
            rounded-xl border border-[color:var(--color-primary-50)]
            bg-[color:var(--color-surface-50)]
            px-3 py-2 text-sm
          "
        >
          Bezugsperson:&nbsp;
          <span className="font-medium text-[color:var(--color-primary)]">
            {member?.name}
          </span>
        </div>

        {/* Felder */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full min-w-0">
          {/* Beziehung */}
          <label className="text-sm flex flex-col gap-1 min-w-0">
            Beziehung
            <select
              className="
                w-full min-w-0
                rounded-lg border border-[color:var(--color-primary-50)]
                bg-white p-2 outline-none
                focus:ring-2 focus:ring-[color:var(--color-primary)]
              "
              value={relationship}
              onChange={(e) => onRelationshipChange(e.target.value as AllowedRelationship)}
            >
              <option value="CHILD">Kind</option>
              <option value="SPOUSE">Ehepartner</option>
              <option value="PARENT">Elternteil</option>
            </select>
          </label>

          {/* Geschlecht */}
          <label className="text-sm flex flex-col gap-1 min-w-0">
            Geschlecht
            <select
              className="
                w-full min-w-0
                rounded-lg border border-[color:var(--color-primary-50)]
                bg-white p-2 outline-none
                focus:ring-2 focus:ring-[color:var(--color-primary)]
              "
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
            >
              <option value={Gender.MALE}>Männlich</option>
              <option value={Gender.FEMALE}>Weiblich</option>
            </select>
          </label>

          {/* Name */}
          <label className="text-sm flex flex-col gap-1 min-w-0">
            Name des neuen Mitglieds
            <input
              className="
                w-full min-w-0
                rounded-lg border border-[color:var(--color-primary-50)]
                bg-white p-2 outline-none
                focus:ring-2 focus:ring-[color:var(--color-primary)]
              "
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              placeholder="z. B. Anna Beispiel"
              required
            />
          </label>
        </div>

        {/* Bedingte Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {relationship === 'CHILD' && (
            <label className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-[color:var(--color-surface-50)] border border-[color:var(--color-primary-50)]">
              <span className="text-sm">Adoptiert</span>
              <button
                type="button"
                role="switch"
                aria-checked={isAdopted}
                onClick={() => setIsAdopted((v) => !v)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition
                  ${isAdopted ? 'bg-[color:var(--color-primary)]' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white transition
                    ${isAdopted ? 'translate-x-5' : 'translate-x-1'}
                  `}
                />
              </button>
            </label>
          )}

          {relationship === 'PARENT' && (
            <label className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-[color:var(--color-surface-50)] border border-[color:var(--color-primary-50)]">
              <span className="text-sm">Mit bisherigem Elternteil verheiratet</span>
              <button
                type="button"
                role="switch"
                aria-checked={marriedToExistingParent}
                onClick={() => setMarriedToExistingParent((v) => !v)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition
                  ${marriedToExistingParent ? 'bg-[color:var(--color-primary)]' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white transition
                    ${marriedToExistingParent ? 'translate-x-5' : 'translate-x-1'}
                  `}
                />
              </button>
            </label>
          )}
        </div>

        {/* Aktionen */}
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
          <Button onClick={onSubmit}>Abbrechen</Button>
          <Button type="submit" disabled={!canSubmit} isPrimary>
            Hinzufügen
          </Button>
        </div>
      </form>
    </Modal>
  )
}
