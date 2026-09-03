/**
 * Verifies immediate and persisted changes made through setLoggingEnabled.
 */
import { afterEach, describe, expect, test } from "vitest";
import { deferred } from "../../../test-utils/deferred";
import { cleanupLogger, setupLogger } from "./helpers";

describe("setLoggingEnabled", () => {
  afterEach(cleanupLogger);

  test("keeps the immediate change when persistence fails", async () => {
    const pendingWrite = deferred<void>();
    const app = await setupLogger({ stored: false });
    await app.loadLoggingEnabled();
    app.storage.queueSet(pendingWrite.promise);

    const write = app.setLoggingEnabled(true);
    app.logger.warn("before rejection");
    expect(app.storage.set).toHaveBeenCalledWith({ "logging-enabled": true });

    pendingWrite.reject(new Error("storage unavailable"));
    await expect(write).rejects.toThrow("storage unavailable");
    app.logger.warn("after rejection");

    expect(app.writes).toEqual([
      ["warn", "before rejection"],
      ["warn", "after rejection"],
    ]);
  });

  test("keeps the immediate change when storage is unavailable", async () => {
    const app = await setupLogger({ captureErrors: true, storage: false });

    const write = app.setLoggingEnabled(true);
    app.logger.error("enabled in memory");

    await expect(write).rejects.toThrow(/chrome\.storage/);
    expect(app.writes).toEqual([["error", "enabled in memory"]]);
  });
});
