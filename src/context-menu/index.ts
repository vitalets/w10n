/**
 * Provides idempotent registration for stable-ID WebExtension context-menu items.
 */

/**
 * Updates an existing context-menu item, or creates it when updating fails.
 */
export async function upsertContextMenu(
  id: string,
  properties: Omit<chrome.contextMenus.CreateProperties, 'id' | 'onclick'>,
) {
  try {
    await chrome.contextMenus.update(id, properties);
  } catch {
    await createContextMenu(id, properties);
  }
}

/**
 * Creates a context-menu item and exposes callback-reported failures as a promise rejection.
 */
function createContextMenu(
  id: string,
  properties: Omit<chrome.contextMenus.CreateProperties, 'id' | 'onclick'>,
) {
  return new Promise<void>((resolve, reject) => {
    chrome.contextMenus.create({ id, ...properties }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}
