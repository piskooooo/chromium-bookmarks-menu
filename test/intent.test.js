import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveIntent, shouldKeepPopupOpen } from '../lib/intent.js';

const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
const left = (mods = {}) => ({ ...plain, ...mods });

test('bookmark: plain left click opens in the current tab', () => {
  assert.equal(resolveIntent(left(), 'bookmark'), 'open-current');
});

test('bookmark: ctrl+left opens a background tab', () => {
  assert.equal(resolveIntent(left({ ctrlKey: true }), 'bookmark'), 'open-background-tab');
});

test('bookmark: cmd+left opens a background tab', () => {
  assert.equal(resolveIntent(left({ metaKey: true }), 'bookmark'), 'open-background-tab');
});

test('bookmark: ctrl+shift+left opens a foreground tab', () => {
  assert.equal(resolveIntent(left({ ctrlKey: true, shiftKey: true }), 'bookmark'), 'open-foreground-tab');
});

test('bookmark: shift+left opens a new window', () => {
  assert.equal(resolveIntent(left({ shiftKey: true }), 'bookmark'), 'open-window');
});

test('bookmark: middle click opens a background tab', () => {
  assert.equal(resolveIntent(left({ button: 1 }), 'bookmark'), 'open-background-tab');
});

test('bookmark: middle click ignores shift/ctrl', () => {
  assert.equal(resolveIntent(left({ button: 1, shiftKey: true }), 'bookmark'), 'open-background-tab');
});

test('bookmark: right click is left alone', () => {
  assert.equal(resolveIntent(left({ button: 2 }), 'bookmark'), 'none');
});

test('folder: plain left click toggles expansion', () => {
  assert.equal(resolveIntent(left(), 'folder'), 'toggle');
});

test('folder: ctrl+left opens every bookmark in the folder in background tabs', () => {
  assert.equal(resolveIntent(left({ ctrlKey: true }), 'folder'), 'open-all-background');
});

test('folder: cmd+left opens every bookmark in the folder in background tabs', () => {
  assert.equal(resolveIntent(left({ metaKey: true }), 'folder'), 'open-all-background');
});

test('folder: middle click opens every bookmark in the folder in background tabs', () => {
  assert.equal(resolveIntent(left({ button: 1 }), 'folder'), 'open-all-background');
});

test('folder: shift+left opens every bookmark in the folder in a new window', () => {
  assert.equal(resolveIntent(left({ shiftKey: true }), 'folder'), 'open-all-window');
});

test('folder: ctrl+shift+left opens every bookmark in the folder in a new window', () => {
  assert.equal(resolveIntent(left({ ctrlKey: true, shiftKey: true }), 'folder'), 'open-all-window');
});

test('folder: right click is left alone', () => {
  assert.equal(resolveIntent(left({ button: 2 }), 'folder'), 'none');
});

test('shouldKeepPopupOpen: middle click stays open', () => {
  assert.equal(shouldKeepPopupOpen(left({ button: 1 })), true);
});

test('shouldKeepPopupOpen: shift click closes', () => {
  assert.equal(shouldKeepPopupOpen(left({ shiftKey: true })), false);
});

test('shouldKeepPopupOpen: ctrl/cmd click keeps popup open', () => {
  assert.equal(shouldKeepPopupOpen(left({ ctrlKey: true })), true);
  assert.equal(shouldKeepPopupOpen(left({ metaKey: true })), true);
});

test('shouldKeepPopupOpen: left click closes', () => {
  assert.equal(shouldKeepPopupOpen(left()), false);
});
