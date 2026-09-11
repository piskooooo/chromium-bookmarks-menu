// Popup glue: real bookmark data in, Firefox-style click semantics out.
// All decision logic lives in lib/ (unit tested); this file only touches
// DOM + chrome.* APIs.

import { ACTIONS, resolveIntent, shouldKeepPopupOpen } from './lib/intent.js';
import { buildSections, collectOpenable, filterIndex, nodeKind } from './lib/tree.js';

const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const hintEl = document.getElementById('hint');
const manageEl = document.getElementById('manage');

/** @type {Map<string, chrome.bookmarks.BookmarkTreeNode>} */
const byId = new Map();
const expanded = new Set();

let root = null;

// ---------- rendering ----------

function index(node) {
  byId.set(node.id, node);
  for (const child of node.children || []) index(child);
}

function faviconUrl(url) {
  return chrome.runtime.getURL(
    `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`,
  );
}

function makeIcon(url) {
  const img = document.createElement('img');
  img.className = 'fav';
  img.src = faviconUrl(url);
  img.alt = '';
  img.addEventListener('error', () => {
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = '•';
    img.replaceWith(glyph);
  });
  return img;
}

function rowFor(node, kind, extra = {}) {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.kind = kind;
  row.dataset.id = node.id;
  if (kind === 'bookmark') {
    row.dataset.url = node.url;
    row.title = node.url;
  }

  const chev = document.createElement('span');
  chev.className = 'chev';
  chev.textContent = kind === 'folder' ? '▶' : '';
  row.appendChild(chev);

  if (kind === 'bookmark') {
    row.appendChild(makeIcon(node.url));
  } else {
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = '📁';
    row.appendChild(glyph);
  }

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = node.title || node.url || '(untitled)';
  row.appendChild(title);

  if (extra.path) {
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = extra.path;
    row.appendChild(sub);
  }
  return row;
}

function folderElement(node) {
  const wrap = document.createElement('div');
  wrap.className = 'folder';
  if (expanded.has(node.id)) wrap.classList.add('expanded');

  wrap.appendChild(rowFor(node, 'folder'));

  const kids = document.createElement('div');
  kids.className = 'children';
  wrap.appendChild(kids);
  return wrap;
}

function fillFolder(wrap, node) {
  const kids = wrap.querySelector('.children');
  if (kids.dataset.filled === '1') return;
  for (const child of node.children || []) {
    const kind = nodeKind(child);
    if (kind === 'folder') {
      kids.appendChild(folderElement(child));
    } else {
      kids.appendChild(rowFor(child, 'bookmark'));
    }
  }
  kids.dataset.filled = '1';
}

function renderSections() {
  listEl.textContent = '';
  const sections = buildSections(root);
  if (!sections.length) {
    showEmpty('No bookmarks yet.');
    return;
  }
  sections.forEach((section, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'section' + (i === 0 ? '' : '');
    const header = document.createElement('div');
    header.className = 'row';
    header.textContent = section.title || '(untitled)';
    wrap.appendChild(header);

    for (const child of section.node.children || []) {
      const kind = nodeKind(child);
      if (kind === 'folder') {
        wrap.appendChild(folderElement(child));
      } else {
        wrap.appendChild(rowFor(child, 'bookmark'));
      }
    }
    listEl.appendChild(wrap);
  });
}

function renderResults(query) {
  listEl.textContent = '';
  const hits = filterIndex(root, query);
  if (!hits.length) {
    showEmpty(`No bookmarks match \"${query}\".`);
    return;
  }
  hideEmpty();
  for (const hit of hits) {
    listEl.appendChild(rowFor(hit, 'bookmark', { path: hit.path }));
  }
}

function showEmpty(text) {
  listEl.textContent = '';
  const el = document.createElement('div');
  el.id = 'empty';
  el.className = 'show';
  el.textContent = text;
  listEl.appendChild(el);
}

function hideEmpty() {
  const el = listEl.querySelector('#empty');
  if (el) el.remove();
}

function flash(text) {
  hintEl.textContent = text;
  setTimeout(() => {
    if (hintEl.textContent === text) hintEl.textContent = '';
  }, 2500);
}

function clearClipboardPasteTarget() {
  if (document.activeElement === searchEl) {
    searchEl.blur();
  }
}

function getRow(eventTarget) {
  const row = eventTarget.closest('.row');
  if (!row || !row.dataset.kind) return null;
  return row;
}

// ---------- actions ----------

function closePopup() {
  try {
    window.close();
  } catch {
    /* running as a tab (self-test) — nothing to close */
  }
}

async function applyIntent(intent, urls, keepOpen = false) {
  switch (intent) {
    case ACTIONS.OPEN_CURRENT:
      await chrome.tabs.update({ url: urls[0] });
      break;
    case ACTIONS.OPEN_BACKGROUND_TAB:
      await chrome.tabs.create({ url: urls[0], active: false });
      break;
    case ACTIONS.OPEN_FOREGROUND_TAB:
      await chrome.tabs.create({ url: urls[0], active: true });
      break;
    case ACTIONS.OPEN_WINDOW:
      await chrome.windows.create({ url: urls[0] });
      break;
    case ACTIONS.OPEN_ALL_BACKGROUND:
      for (const url of urls) {
        await chrome.tabs.create({ url, active: false });
      }
      break;
    case ACTIONS.OPEN_ALL_WINDOW:
      await chrome.windows.create({ url: urls });
      break;
    default:
      return;
  }
  if (!keepOpen) {
    closePopup();
  }
}

async function handleRow(row, meta) {
  const kind = row.dataset.kind;
  const intent = resolveIntent(meta, kind);

  if (intent === ACTIONS.TOGGLE) {
    const wrap = row.closest('.folder');
    if (!wrap) return;
    const node = byId.get(row.dataset.id);
    const opening = !wrap.classList.contains('expanded');
    if (opening) {
      fillFolder(wrap, node);
      wrap.classList.add('expanded');
      expanded.add(node.id);
    } else {
      wrap.classList.remove('expanded');
      expanded.delete(node.id);
    }
    return;
  }
  if (intent === ACTIONS.NONE) return;

  const urls =
    kind === 'folder' ? collectOpenable(byId.get(row.dataset.id)) : [row.dataset.url];

  if (!urls.length) {
    flash('Nothing openable in that folder');
    return;
  }
  await applyIntent(intent, urls, shouldKeepPopupOpen(meta));
}

// ---------- wiring ----------

listEl.addEventListener('mousedown', (e) => {
  // Kill autoscroll and prevent X11 primary selection paste on middle click.
  if (e.button !== 1) return;
  clearClipboardPasteTarget();
  const row = getRow(e.target);
  if (!row) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  void handleRow(row, { button: 1 });
});

listEl.addEventListener('click', (e) => {
  if (e.button === 1) return;
  const row = getRow(e.target);
  if (!row) return;
  e.preventDefault();
  handleRow(row, {
    button: 0,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
  });
});

searchEl.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    e.preventDefault();
  }
});

searchEl.addEventListener('input', () => {
  const q = searchEl.value;
  if (q.trim()) renderResults(q);
  else {
    hideEmpty();
    renderSections();
  }
});

searchEl.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    searchEl.value = '';
    hideEmpty();
    renderSections();
    return;
  }
  if (e.key !== 'Enter') return;
  const first = listEl.querySelector('.row[data-kind="bookmark"]');
  if (!first) return;
  await handleRow(first, {
    button: 0,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
  });
});

manageEl.addEventListener('click', async () => {
  const url = 'chrome://bookmarks/';
  try {
    await chrome.tabs.create({ url });
    closePopup();
  } catch {
    // Chromium blocks extensions from navigating to most chrome:// pages.
    flash('Open chrome://bookmarks/ manually');
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard not available in this context */
    }
  }
});

for (const evt of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
  chrome.bookmarks[evt]?.addListener(async () => {
    root = (await chrome.bookmarks.getTree())[0];
    byId.clear();
    index(root);
    if (searchEl.value.trim()) renderResults(searchEl.value);
    else renderSections();
  });
}

(async function init() {
  root = (await chrome.bookmarks.getTree())[0];
  index(root);
  renderSections();
})();
