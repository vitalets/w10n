/**
 * Handles extension upgrades by running applicable migrations.
 */
import { logger } from '../w10n/logger';
import { migrate } from './migrations';

chrome.runtime.onInstalled.addListener(onInstalled);

/**
 * Runs applicable migrations when the extension is upgraded.
 */
async function onInstalled(details: chrome.runtime.InstalledDetails) {
  if (details.reason !== 'update') return;
  try {
    await migrate({
      previousVersion: details.previousVersion,
      currentVersion: chrome.runtime.getManifest().version,
    });
  } catch (error) {
    logger.error('Could not run upgrade migrations', error);
  }
}
