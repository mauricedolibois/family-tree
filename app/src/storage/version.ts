// Header used by server and client to exchange the version of the stored tree.
// On save the client sends the version it loaded. If it no longer matches, the
// tree was changed elsewhere in the meantime (response 409).
export const TREE_VERSION_HEADER = 'x-tree-version'
