// Pure click-intent resolution: Firefox bookmarks-menu semantics.
// No DOM, no extension APIs — unit tested in test/intent.test.js.

export const ACTIONS = {
  NONE: 'none',
  OPEN_CURRENT: 'open-current',
  OPEN_BACKGROUND_TAB: 'open-background-tab',
  OPEN_FOREGROUND_TAB: 'open-foreground-tab',
  OPEN_WINDOW: 'open-window',
  TOGGLE: 'toggle',
  OPEN_ALL_BACKGROUND: 'open-all-background',
  OPEN_ALL_WINDOW: 'open-all-window',
};

/**
 * @param {{button?: number, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean}} meta
 * @param {'bookmark'|'folder'} kind
 * @returns {string} one of ACTIONS
 */
export function resolveIntent(meta, kind) {
  const button = meta.button ?? 0;
  // Right click: let the browser/OS menu through untouched.
  if (button === 2) return ACTIONS.NONE;
  // Any non-left, non-middle button: ignore.
  if (button !== 0 && button !== 1) return ACTIONS.NONE;

  const middle = button === 1;
  const accel = Boolean(meta.ctrlKey || meta.metaKey); // ctrl on win/linux, cmd on mac
  const shift = Boolean(meta.shiftKey);

  if (kind === 'folder') {
    if (middle) return ACTIONS.OPEN_ALL_BACKGROUND;
    if (shift) return ACTIONS.OPEN_ALL_WINDOW;
    if (accel) return ACTIONS.OPEN_ALL_BACKGROUND;
    return ACTIONS.TOGGLE;
  }

  // kind === 'bookmark'
  if (middle) return ACTIONS.OPEN_BACKGROUND_TAB;
  if (accel && shift) return ACTIONS.OPEN_FOREGROUND_TAB;
  if (accel) return ACTIONS.OPEN_BACKGROUND_TAB;
  if (shift) return ACTIONS.OPEN_WINDOW;
  return ACTIONS.OPEN_CURRENT;
}

/**
 * Keep the popup open for middle click and ctrl/cmd variants.
 *
 * Shift is deliberately excluded: shift+click opens in a new window, which is
 * a "leave the panel" action, so the popup closes like a plain left click.
 *
 * @param {{button?: number, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}} meta
 */
export function shouldKeepPopupOpen(meta) {
  return meta.button === 1 || Boolean(meta.ctrlKey || meta.metaKey);
}
