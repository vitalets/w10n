/**
 * Demonstrates a non-critical string-to-array upgrade with consumer-owned error handling.
 */
import type { Migration } from '../w10n/migration';

/**
 * Upgrades the exampleStrings storage value for release 0.0.2.
 */
export const migration: Migration = {
  version: '0.0.2',
  /**
   * Converts a stored string and reports failures without blocking later migrations.
   */
  async run() {
    try {
      const { exampleStrings } = await chrome.storage.local.get('exampleStrings');
      if (typeof exampleStrings !== 'string') return;
      await chrome.storage.local.set({ exampleStrings: [exampleStrings] });
    } catch (error) {
      console.error('Non-critical string-to-array migration failed', error);
    }
  },
};
