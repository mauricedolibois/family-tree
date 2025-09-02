import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import { AllowedRelationship } from '@/types/Relationship'
import { Button } from '@zendeskgarden/react-buttons'
import { Combobox, Field, Label, Option } from '@zendeskgarden/react-dropdowns.next'
import { Input } from '@zendeskgarden/react-forms'
import { Body, Close, Footer, FooterItem, Header, Modal } from '@zendeskgarden/react-modals'
import { FormEvent, useMemo, useState } from 'react'
import { useFamilyTree } from '@/components/FamilyTreeProvider'
import { serializeFromRoot } from '@/storage/schema'
import { serializeTagged } from '@/debug/serializeTagged'

interface AddMemberProps {
  onSubmit: () => void
  member: IMember
}

const AddMember = ({ onSubmit, member }: AddMemberProps) => {
  const [newMember, setNewMember] = useState<string>('')
  const [relationship, setRelationship] = useState<AllowedRelationship>('CHILD')
  const [gender, setGender] = useState<Gender>(Gender.MALE)

  // WICHTIG: applyStored + storedSnapshot statt cloneDeep
  const { familyTree, applyStored, storedSnapshot } = useFamilyTree()

  const canSubmit = useMemo(
    () => newMember.trim().length > 0 && !!relationship && gender !== undefined,
    [newMember, relationship, gender]
  )

  const handleAddMember = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = newMember.trim()

    try {
      familyTree.addMember(member.name, name, gender, relationship)

      // EINZIGER Commit: serialize aktuelles Model + applyStored (triggert Persist-Effect)
      const stored = serializeFromRoot(familyTree.root, storedSnapshot)
      applyStored(stored)

      onSubmit()
    } catch (err: any) {
      console.error('[UI] addMember ERROR', err)
      alert(err?.message ?? String(err) ?? 'Something went wrong')
    }
  }



  return (
    <Modal onClose={onSubmit}>
      <form className="flex flex-col gap-4" onSubmit={handleAddMember} role="form">
        <Header tag="h2">Add new family member</Header>

        <Body className="!flex flex-col gap-4">
          <Field>
            <Label htmlFor="relativeName">Relative name</Label>
            <Input id="relativeName" required value={member?.name} disabled />
          </Field>

          <Field>
            <Label htmlFor="relationship">Relationship</Label>
            <Combobox
              id="relationship"
              isEditable={false}
              placeholder="Relation to relative member"
              onChange={({ selectionValue }) => {
                if (selectionValue !== undefined) {
                  setRelationship(selectionValue as AllowedRelationship)
                }
              }}
            >
              <Option value="CHILD" label="Kind" />
              <Option value="SPOUSE" label="Ehepartner" />
              <Option value="PARENT" label="Elternteil" />
            </Combobox>
          </Field>

          <Field>
            <Label htmlFor="newMemberName">Name</Label>
            <Input
              id="newMemberName"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              placeholder="New member's name"
              required
            />
          </Field>

          <Field>
            <Label htmlFor="gender">Geschlecht</Label>
            <Combobox
              id="gender"
              isEditable={false}
              placeholder="Geschlecht wählen"
              onChange={({ selectionValue }) => {
                if (selectionValue !== undefined) {
                  setGender(selectionValue as Gender)
                }
              }}
            >
              <Option value={Gender.MALE} label="Männlich" />
              <Option value={Gender.FEMALE} label="Weiblich" />
            </Combobox>
          </Field>
        </Body>

        <Footer>
          <FooterItem>
            <Button onClick={onSubmit} isBasic type="reset">
              Abbrechen
            </Button>
          </FooterItem>
          <FooterItem>
            <Button isPrimary type="submit" disabled={!canSubmit}>
              Hinzufügen
            </Button>
          </FooterItem>
        </Footer>

        <Close aria-label="Close modal" />
      </form>
    </Modal>
  )
}

export default AddMember
