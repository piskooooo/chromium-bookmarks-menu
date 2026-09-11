import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSections, collectOpenable, filterIndex, isOpenable } from '../lib/tree.js';

// Mirrors the shape chrome.bookmarks.getTree() returns: one root node whose
// children are the permanent folders (bookmarks bar, other, mobile).
const tree = {
  id: '0',
  title: '',
  children: [
    {
      id: '1',
      title: 'Bookmarks bar',
      children: [
        { id: '10', title: 'eBay', url: 'https://www.ebay.com/' },
        {
          id: '11',
          title: 'AI',
          children: [
            { id: '110', title: 'Claude', url: 'https://claude.ai/' },
            {
              id: '111',
              title: 'Local',
              children: [{ id: '1110', title: 'Ollama', url: 'http://192.0.2.10:11434/' }],
            },
          ],
        },
        { id: '12', title: 'Unopenable', url: 'javascript:void(0)' },
      ],
    },
    {
      id: '2',
      title: 'Other bookmarks',
      children: [{ id: '20', title: 'NASty', url: 'https://192.0.2.10/' }],
    },
    { id: '3', title: 'Mobile bookmarks', children: [] },
  ],
};

test('isOpenable accepts web-ish schemes only', () => {
  assert.equal(isOpenable('https://x.test/'), true);
  assert.equal(isOpenable('http://x.test/'), true);
  assert.equal(isOpenable('ftp://x.test/f'), true);
  assert.equal(isOpenable('file:///tmp/x'), true);
  assert.equal(isOpenable('javascript:void(0)'), false);
  assert.equal(isOpenable('chrome://bookmarks/'), false);
  assert.equal(isOpenable(undefined), false);
});

test('buildSections returns non-empty permanent folders, first one expanded', () => {
  const sections = buildSections(tree);
  assert.deepEqual(
    sections.map((s) => [s.id, s.title, s.expanded]),
    [
      ['1', 'Bookmarks bar', true],
      ['2', 'Other bookmarks', false],
    ],
  );
});

test('buildSections keeps the live node so subfolders stay expandable', () => {
  const [bar] = buildSections(tree);
  assert.equal(bar.node.children.length, 3);
  assert.equal(bar.node.children[1].title, 'AI');
});

test('collectOpenable walks subfolders recursively and skips unopenable urls', () => {
  const aiFolder = tree.children[0].children[1];
  assert.deepEqual(collectOpenable(aiFolder), [
    'https://claude.ai/',
    'http://192.0.2.10:11434/',
  ]);
});

test('collectOpenable on a bookmark returns just itself', () => {
  assert.deepEqual(collectOpenable({ id: 'x', title: 'eBay', url: 'https://www.ebay.com/' }), [
    'https://www.ebay.com/',
  ]);
});

test('collectOpenable on a folder with only unopenable content returns empty', () => {
  assert.deepEqual(collectOpenable({ id: 'y', title: 'junk', children: [{ id: 'z', title: 'js', url: 'javascript:void(0)' }] }), []);
});

test('filterIndex matches titles case-insensitively and carries the folder path', () => {
  const hits = filterIndex(tree, 'claude');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].url, 'https://claude.ai/');
  assert.equal(hits[0].path, 'Bookmarks bar / AI');
});

test('filterIndex matches urls too', () => {
  const hits = filterIndex(tree, '192.0.2.10');
  assert.deepEqual(
    hits.map((h) => h.url).sort(),
    ['http://192.0.2.10:11434/', 'https://192.0.2.10/'],
  );
});

test('filterIndex returns every openable bookmark for an empty query', () => {
  const hits = filterIndex(tree, '');
  assert.equal(hits.length, 4);
});

test('filterIndex never returns unopenable urls', () => {
  assert.equal(filterIndex(tree, 'void').length, 0);
});
