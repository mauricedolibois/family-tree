// src/models/family/mutations.ts
import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'

/* ------------------------------------------------------------------ */
/* PARENT-ONLY LINKING (kein Auto-Spouse, kein Auto-Grandparenting)   */
/* ------------------------------------------------------------------ */

/**
 * Verknüpft EXACTLY ONE parent mit child:
 * - Fügt child zu parent.children hinzu (falls nicht vorhanden)
 * - Fügt parent zu child.parents hinzu (falls nicht vorhanden)
 * - KEIN Propagieren zum Spouse, KEIN Auto-Heiraten
 */
function linkParentOneSided(parent: Member, child: Member) {
  // max. 2 Eltern durchsetzen (außer parent ist schon verknüpft)
  if (child.parents.length >= 2 && !child.parents.some((p) => p.id === parent.id)) {
    throw new Error('This person already has two parents.')
  }

  // parent -> children
  if (!parent.children.some((c) => c.id === child.id)) {
    parent.children.push(child)
  }

  // child -> parents
  if (!child.parents.some((p) => p.id === parent.id)) {
    child.parents.push(parent)
  }
}

/* ------------------------------------------------------------------ */
/* CHILD                                                               */
/* ------------------------------------------------------------------ */

/**
 * Kind hinzufügen:
 * - Bei gemischtgeschlechtlichem Ehepaar → beide als Eltern verknüpfen
 * - Bei gleichgeschlechtlichem Paar ODER Single → nur den ausgewählten Parent verknüpfen
 *   (kein automatisches Hinzufügen des Spouse!)
 */
export function addChild(_root: Member, parent: Member, child: Member): void {
  const spouse = parent.spouse

  if (spouse && spouse.gender !== parent.gender) {
    // gemischtgeschlechtliches Paar → beide als Eltern
    // (Reihenfolge egal; wir verknüpfen explizit BEIDE)
    linkParentOneSided(parent, child)
    linkParentOneSided(spouse, child)
    return
  }

  // gleichgeschlechtlich oder Single → nur der ausgewählte Parent
  linkParentOneSided(parent, child)
}

/* ------------------------------------------------------------------ */
/* SPOUSE                                                              */
/* ------------------------------------------------------------------ */

/** Ehepartner hinzufügen – ohne Eltern/Kinder anzufassen */
export function addSpouse(member: Member, spouse: Member): void {
  if (member.isMarried()) {
    throw new Error(`${member.name} is already married to ${member.spouse?.name}.`)
  }
  if (spouse.isMarried()) {
    throw new Error(`${spouse.name} is already married to ${spouse.spouse?.name}.`)
  }
  member.addSpouse(spouse) // keine weiteren Seiteneffekte
}

/* ------------------------------------------------------------------ */
/* PARENT                                                              */
/* ------------------------------------------------------------------ */

/**
 * Elternteil hinzufügen (ID/Instanz-basiert, kein Name-Lookup).
 * Anforderungen:
 * - Neuer Parent bekommt das Kind **ohne** den Spouse als zweiten Parent zu verknüpfen.
 * - Kein automatisches Verheiraten existierender Eltern (optional via options).
 * - Root-Handling (optional – du hast es drin; ich lasse die Logik intakt):
 *    • Wenn das Kind bisher keine Eltern hatte → neuer Parent kann Root werden.
 *    • Wenn das Kind Root oder Root-Spouse war → neuer Parent kann Root werden.
 *
 * options:
 *   - marryExistingParent?: boolean
 *       Wenn das Kind GENAU EINEN anderen Parent hat und beide unverheiratet sind,
 *       diese beiden als Ehepartner verknüpfen (ohne Kinderlisten zu verändern).
 */
export function addParent(
  rootRef: { root: Member },
  child: Member,
  newParent: Member,
  options?: { marryExistingParent?: boolean },
): void {
  const { root } = rootRef

  const hadParentsBefore = child.parents.length > 0
  const wasRootOrRootSpouse = root === child || root.spouse === child

  // 1) tatsächliche Verknüpfung NUR einseitig (kein Spouse-Propagate)
  linkParentOneSided(newParent, child)

  // 2) Optional: vorhandenen einzelnen Parent heiraten (ohne Kinder zu synchronisieren)
  if (options?.marryExistingParent === true) {
    const uniqueParents = child.parents.filter(
      (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
    )
    if (uniqueParents.length === 2) {
      const [p1, p2] = uniqueParents
      const alreadySpouses =
        (p1.spouse && p1.spouse.id === p2.id) || (p2.spouse && p2.spouse.id === p1.id)
      if (!alreadySpouses && !p1.spouse && !p2.spouse) {
        p1.addSpouse(p2)
        // addSpouse ändert KEINE children/parents-Listen → kein Auto-Grandparenting
      }
    }
  }

  // 3) Root ggf. anpassen – nur beim ersten Elternteil ODER wenn das Kind bisher Root/Root-Spouse war
  if (wasRootOrRootSpouse && !hadParentsBefore) {
    rootRef.root = newParent
  }
}
