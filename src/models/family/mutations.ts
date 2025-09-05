import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'
import { parentOfId } from './traverse'

/** Kind an Elternteil anhängen – nur an EINE Seite (kanonisch) */
export function attachChildCanonically(parent: Member, child: Member): void {
  const spouse = parent.spouse
  if (spouse && spouse.gender !== parent.gender) {
    // gemischtgeschlechtlich → Mutter als kanonischer Parent
    const mother = parent.gender === Gender.FEMALE ? parent : spouse
    mother.addChild(child)
    return
  }
  // gleichgeschlechtlich oder Single → an den ausgewählten Parent hängen
  parent.addChild(child)
}

export function addChild(_root: Member, parent: Member, child: Member): void {
  attachChildCanonically(parent, child)
}

/** Ehepartner hinzufügen – gleichgeschlechtlich erlaubt */
export function addSpouse(member: Member, spouse: Member): void {
  if (member.isMarried()) {
    throw new Error(`${member.name} is already married to ${member.spouse?.name}.`)
  }
  member.addSpouse(spouse)
}

/**
 * Elternteil hinzufügen (ID/Instanz-basiert, kein Name-Lookup).
 * - Neuer Parent bekommt das Kind (falls nicht vorhanden)
 * - Falls es noch keinen Parent gab ODER das Kind Root/Root-Spouse war → neuer Parent wird Root
 * - Bestehenden Parent NICHT automatisch verheiraten (kein Auto-Merge)
 */
export function addParent(rootRef: { root: Member }, child: Member, newParent: Member): void {
  const { root } = rootRef

  const hadParentBefore = !!parentOfId(root, child.id)
  const wasRootOrRootSpouse = root === child || root.spouse === child

  if (!newParent.children.some((c) => c.id === child.id)) {
    newParent.addChild(child)
  }

  if (!hadParentBefore || wasRootOrRootSpouse) {
    rootRef.root = newParent
    return
  }

  // Bestehenden Parent bewusst NICHT automatisch verheiraten.
  // (Falls du es konfigurierbar brauchst, hier Option einführen.)
}
