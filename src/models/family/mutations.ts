// src/models/family/mutations.ts
import { Member } from '@/models/Member'

/* ------------------------------------------------------------------ */
/* PARENT-ONLY LINKING (kein Auto-Spouse, kein Auto-Grandparenting)   */
/* ------------------------------------------------------------------ */

/**
 * Verknüpft EXACTLY ONE parent mit child:
 * - Fügt child zu parent.children hinzu (falls nicht vorhanden)
 * - Fügt parent zu child.parents hinzu (falls nicht vorhanden)
 * - KEIN Propagieren zum Spouse, KEIN Auto-Heiraten
 * - Optional: Adoption-Flag für genau diese Parent→Child-Kante
 */
function linkParentOneSided(parent: Member, child: Member, opts?: { adopted?: boolean }) {
  // max. 2 Eltern durchsetzen (außer parent ist schon verknüpft)
  if (child.parents.length >= 2 && !child.parents.some((p) => p.id === parent.id)) {
    throw new Error('This person already has two parents.')
  }

  // einseitiger Link + optionales Adoption-Flag
  parent.addChild(child, { adopted: opts?.adopted === true })
}

/* ------------------------------------------------------------------ */
/* CHILD                                                               */
/* ------------------------------------------------------------------ */

/**
 * Kind hinzufügen:
 * - Wenn parent verheiratet → Kind bei BEIDEN Eltern verknüpfen (unabhängig vom Gender)
 *   • Falls opts.adopted === true → Adoption bei BEIDEN Parents markieren
 * - Wenn Single → nur beim ausgewählten Parent verknüpfen
 */
export function addChild(
  _root: Member,
  parent: Member,
  child: Member,
  opts?: { adopted?: boolean }
): void {
  const adopted = opts?.adopted === true
  const spouse = parent.spouse

  // immer den ausgewählten Parent verknüpfen
  linkParentOneSided(parent, child, { adopted })

  // wenn verheiratet: auch den Ehepartner verknüpfen
  if (spouse) {
    linkParentOneSided(spouse, child, { adopted })
  }
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
 * - Neuer Parent bekommt das Kind **ohne** den Spouse als zweiten Parent zu verknüpfen.
 * - Optional: vorhandene einzelne Eltern verheiraten (ohne Kinderlisten zu verändern).
 * - Root-Handling bleibt unverändert.
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
      }
    }
  }

  // 3) Root ggf. anpassen – nur beim ersten Elternteil ODER wenn das Kind bisher Root/Root-Spouse war
  if (wasRootOrRootSpouse && !hadParentsBefore) {
    rootRef.root = newParent
  }
}
