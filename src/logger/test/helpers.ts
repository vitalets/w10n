/**
 * Provides logger test helpers for controllable storage, console, and errors.
 */
import { vi } from "vitest";
import {
  installChromeStorage,
} from "../../../test-utils/chrome-storage";
import { captureConsole } from "../../../test-utils/console";

type StorageHarness = ReturnType<typeof installChromeStorage>;
type StorageValues = Record<string, unknown>;

interface LoggerSetupOptions {
  captureErrors?: boolean;
  env?: string | boolean;
  initialLoad?: Promise<StorageValues> | StorageValues;
  storage?: StorageHarness | false;
  stored?: unknown;
}

const storageKey = "logging-enabled";

/**
 * Imports a fresh logger module configured for one observable test scenario.
 */
export async function setupLogger(options: LoggerSetupOptions = {}) {
  vi.resetModules();
  const env = Object.hasOwn(options, "env") ? options.env : "false";
  vi.stubEnv("LOGGING", env as string | undefined);

  const storage =
    options.storage ||
    installChromeStorage(
      Object.hasOwn(options, "stored")
        ? { [storageKey]: options.stored }
        : {},
    );
  if (options.initialLoad) storage.queueGet(options.initialLoad);
  if (options.storage === false) vi.stubGlobal("chrome", undefined);

  const writes = captureConsole();
  const reportedErrors: Array<() => void> = [];
  if (options.captureErrors) {
    vi.stubGlobal("queueMicrotask", (callback: () => void) => {
      reportedErrors.push(callback);
    });
  }

  const loggerModule = await import("../index");
  return { ...loggerModule, reportedErrors, storage, writes };
}

/**
 * Restores globals, environment values, and spies changed by a logger test.
 */
export function cleanupLogger() {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
}
