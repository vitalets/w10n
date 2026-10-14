/**
 * Creates an action-scoped DEBUG submenu and dispatches its commands using generated IDs.
 */

/**
 * A labeled development action invoked from the DEBUG submenu.
 */
export type DebugCommand = {
  title: string;
  run: () => unknown;
};

/**
 * Reserved identifier for this module's submenu and generated child IDs.
 */
const MENU_ID = 'w10n-debug';

/**
 * Registers command handling synchronously and replaces the DEBUG submenu.
 * Call once during service-worker initialization, gated by the consumer's development mode.
 */
export async function createDebugContextMenu(commands: readonly DebugCommand[]) {
  const items = commands.map((command, index) => ({
    ...command,
    id: `${MENU_ID}-${index}`,
  }));

  /**
   * Dispatches clicks belonging to this menu to their command.
   */
  function handleClick(info: chrome.contextMenus.OnClickData) {
    const command = items.find(({ id }) => id === info.menuItemId);
    if (command) void command.run();
  }

  chrome.contextMenus.onClicked.addListener(handleClick);
  try {
    // Removing the parent also removes stale commands from a previous worker.
    await chrome.contextMenus.remove(MENU_ID).catch(() => {});
    if (!items.length) return;
    await createItem({ id: MENU_ID, title: 'DEBUG', contexts: ['action'] });
    for (const { id, title } of items) {
      await createItem({ id, title, parentId: MENU_ID, contexts: ['action'] });
    }
  } catch (error) {
    chrome.contextMenus.onClicked.removeListener(handleClick);
    throw error;
  }
}

/**
 * Creates an item and propagates Chrome's callback-reported errors.
 */
function createItem(properties: chrome.contextMenus.CreateProperties) {
  return new Promise<void>((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}
