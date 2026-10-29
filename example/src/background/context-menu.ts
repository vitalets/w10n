/**
 * Registers the options context-menu item and reports successful usage.
 */
import { upsertContextMenu } from '../w10n/context-menu';
import { withErrorStack } from '../w10n/errors';
import { logger } from '../w10n/logger';
import { analyticsReady } from './analytics';

/**
 * Identifies the action command that opens extension options.
 */
const menuId = 'openOptions';

chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
void initContextMenu();

/**
 * Creates or updates the action's options command on each worker startup.
 */
async function initContextMenu() {
  try {
    await upsertContextMenu(menuId, { title: 'Open options', contexts: ['action'] });
    logger.info('Background started');
  } catch (error) {
    logger.error('Could not register the context-menu item', error);
  }
}

/**
 * Opens options and reports successful context-menu usage when analytics is configured.
 */
async function onContextMenuClicked(info: chrome.contextMenus.OnClickData) {
  if (info.menuItemId !== menuId) return;
  try {
    await withErrorStack(() => chrome.runtime.openOptionsPage());
    const analytics = await analyticsReady;
    await analytics?.sendEvent('options_opened', { source: 'context_menu' });
  } catch (error) {
    logger.error('Could not open options', error);
  }
}
