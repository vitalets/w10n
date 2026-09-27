/**
 * Declares the example extension's pages, background worker, and permissions.
 */
import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'w10n example',
  version: '0.0.1',
  minimum_chrome_version: '123',
  permissions: ['storage', 'contextMenus'],
  background: { service_worker: 'src/background.ts', type: 'module' },
  action: { default_popup: 'src/popup/index.html' },
  options_page: 'src/options/index.html',
});
