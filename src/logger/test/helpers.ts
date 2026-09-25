/**
 * Provides logger test helpers for controllable storage, console, and environment values.
 */
import { vi } from 'vitest';
import { installChromeStorage } from '../../../test-utils/chrome-storage';
import { captureConsole } from '../../../test-utils/console';

interface LoggerSetupOptions {
  env?: {
    LOGGING?: string | boolean;
  };
  storage?: Record<string, unknown>;
  initialLoad?: Promise<Record<string, unknown>>;
}

/**
 * Imports a fresh logger module configured for one observable test scenario.
 */
export async function setupLogger(options: LoggerSetupOptions = {}) {
  vi.resetModules();
  vi.stubEnv('LOGGING', options.env?.LOGGING as string | undefined);

  const storage = installChromeStorage(options.storage);
  if (options.initialLoad) storage.queueGet(options.initialLoad);

  const stdout = captureConsole();

  const loggerModule = await import('../index');
  return { ...loggerModule, stdout, storage };
}

/**
 * Restores globals, environment values, and spies changed by a logger test.
 */
export function cleanupLogger() {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
}
