/**
 * Registers the options context-menu item, upgrade steps, and optional background analytics.
 */
import { upsertContextMenu } from './w10n/context-menu';
import { withErrorStack } from './w10n/errors';
import { createGoogleAnalytics } from './w10n/google-analytics';
import { logger } from './w10n/logger';
import { storage } from './w10n/storage';
import { migrate } from './migrations';

/**
 * Identifies the action command that opens extension options.
 */
const menuId = 'openOptions';
/**
 * Persists the installation identity used by optional analytics.
 */
const clientId = new storage.local.Item('analyticsClientId', '');
/**
 * Shares optional analytics initialization with event handlers.
 */
const analyticsReady = initAnalytics();

type OptionsOpenedEvent = { name: 'options_opened'; params: { source: 'context_menu' } };

chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
void initBackground();
chrome.runtime.onInstalled.addListener(onInstalled);

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
 * Runs applicable migrations when the extension is upgraded.
 */
async function onInstalled(details: chrome.runtime.InstalledDetails) {
  if (details.reason !== 'update' || details.previousVersion === undefined) return;
  try {
    await migrate({
      previousVersion: details.previousVersion,
      currentVersion: chrome.runtime.getManifest().version,
    });
  } catch (error) {
    logger.error('Could not run upgrade migrations', error);
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
