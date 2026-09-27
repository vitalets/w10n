/**
 * Registers the options context-menu item and optional background analytics.
 */
import { upsertContextMenu } from './w10n/context-menu';
import { withErrorStack } from './w10n/errors';
import { createGoogleAnalytics } from './w10n/google-analytics';
import { logger } from './w10n/logger';
import { storage } from './w10n/storage';

type OptionsOpenedEvent = { name: 'options_opened'; params: { source: 'context_menu' } };

const menuId = 'openOptions';
const clientId = new storage.local.Item('analyticsClientId', '');
const analyticsReady = initAnalytics();

chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
void initBackground();

/**
 * Creates or updates the action's options command on each worker startup.
 */
async function initBackground() {
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

/**
 * Enables analytics only when local configuration supplies both credentials.
 */
async function initAnalytics() {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  const apiSecret = import.meta.env.VITE_GA_API_SECRET?.trim();
  if (!measurementId || !apiSecret) return;
  try {
    const installationId = await clientId.set((current) => current || crypto.randomUUID());
    const analytics = createGoogleAnalytics<OptionsOpenedEvent>({
      measurementId,
      apiSecret,
      clientId: installationId,
      onError: (failure) => logger.warn('Analytics delivery failed', failure),
    });
    analytics.captureExceptions();
    return analytics;
  } catch (error) {
    logger.error('Could not initialize analytics', error);
  }
}
