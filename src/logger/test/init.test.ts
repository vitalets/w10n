/**
 * Verifies logger initialization, startup buffering, and initialization failures.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { deferred } from "../../../test-utils/deferred";
import { cleanupLogger, setupLogger } from "./helpers";

describe("initialization", () => {
  afterEach(cleanupLogger);

  test("buffers writes until stored logging is enabled", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({ initialLoad: pendingLoad.promise });

    app.logger.log("started", 1);
    app.logger.warn("warming up");
    app.logger.error("not ready");
    expect(app.writes).toEqual([]);

    pendingLoad.resolve({ "logging-enabled": true });
    await app.loadLoggingEnabled();

    expect(app.writes).toEqual([
      ["log", "started", 1],
      ["warn", "warming up"],
      ["error", "not ready"],
    ]);
  });

  test("reports a missing storage API without blocking import", async () => {
    const app = await setupLogger({ captureErrors: true, storage: false });

    app.logger.log("discarded");
    await vi.waitFor(() => expect(app.reportedErrors).toHaveLength(1));

    expect(app.writes).toEqual([]);
    expect(() => app.reportedErrors[0]!()).toThrow(/chrome\.storage/);
  });

  test("discards buffered writes and reports a failed initial read", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({
      captureErrors: true,
      initialLoad: pendingLoad.promise,
    });

    app.logger.log("buffered");
    pendingLoad.reject(new Error("read failed"));
    await expect(app.loadLoggingEnabled()).rejects.toThrow("read failed");
    app.logger.log("after failure");

    expect(app.writes).toEqual([]);
    expect(app.reportedErrors).toHaveLength(1);
    expect(() => app.reportedErrors[0]!()).toThrow("read failed");
  });
});
