// Pure bookmark-tree helpers over chrome.bookmarks node shapes.
// No DOM, no extension APIs — unit tested in test/tree.test.js.

const OPENABLE = /^(https?|ftp|file):/i;

export function isOpenable(url) {
  return typeof url === 'string' && OPENABLE.test(url);
}

export function nodeKind(node) {
  return node && typeof node.url === 'string' ? 'bookmark' : 'folder';
}

/**
 * Splits chrome.bookmarks.getTree()[0] into the permanent-folder sections the
 * panel shows. Empty folders (e.g. Mobile bookmarks with nothing in it) are
 * dropped rather than rendered as a dead header. The first section — the
 * bookmarks bar — starts expanded, like Firefox.
 */
export function buildSections(rootNode) {
  const children = (rootNode && rootNode.children) || [];
  return children
    .filter((node) => (node.children || []).length > 0)
    .map((node, index) => ({
      id: node.id,
      title: node.title,
      node,
      expanded: index === 0,
    }));
}

/**
 * Every openable url under `node`, depth-first in tree order, recursing into
 * subfolders. Used by "open every bookmark in this folder".
 */
export function collectOpenable(node) {
  if (!node) return [];
  if (typeof node.url === 'string') {
    return isOpenable(node.url) ? [node.url] : [];
  }
  const out = [];
  for (const child of node.children || []) {
    out.push(...collectOpenable(child));
  }
  return out;
}

function indexNode(node, path, out) {
  const kind = nodeKind(node);
  const nextPath = path.slice();
  if (kind === 'folder' && node.title) nextPath.push(node.title);
  if (kind === 'bookmark') {
    if (isOpenable(node.url)) {
      out.push({ id: node.id, title: node.title, url: node.url, path: path.join(' / ') });
    }
    return;
  }
  for (const child of node.children || []) indexNode(child, nextPath, out);
}

/** Flat, searchable index of every openable bookmark in the tree. */
export function buildIndex(rootNode) {
  const out = [];
  indexNode(rootNode, [], out);
  return out;
}

/** Substring match on title or url; empty query returns the whole index. */
export function filterIndex(rootNode, query) {
  const index = buildIndex(rootNode);
  const q = (query || '').trim().toLowerCase();
  if (!q) return index;
  return index.filter(
    (entry) =>
      (entry.title || '').toLowerCase().includes(q) || entry.url.toLowerCase().includes(q),
  );
}
