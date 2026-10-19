// Header, über den Server und Client die Version des gespeicherten Baums austauschen.
// Beim Speichern schickt der Client die Version mit, die er geladen hat. Passt sie
// nicht mehr, wurde der Baum inzwischen woanders geändert (Antwort 409).
export const TREE_VERSION_HEADER = 'x-tree-version'
