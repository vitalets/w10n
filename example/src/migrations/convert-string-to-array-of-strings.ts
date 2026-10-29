/**
 * Converts the example's legacy string value into an array of strings on upgrade.
 */
import type { Migration } from '../w10n/migration';

/**
 * Upgrades the exampleStrings storage value for release 0.0.2.
 */
export const migration: Migration = {
  version: '0.0.2',
  /**
   * Wraps a stored string in an array while preserving other existing values.
   */
  async run() {
    const { exampleStrings } = await chrome.storage.local.get('exampleStrings');
    if (typeof exampleStrings !== 'string') return;
    await chrome.storage.local.set({ exampleStrings: [exampleStrings] });
  },
};
