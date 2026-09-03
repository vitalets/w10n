/**
 * Verifies explicit logging-setting loads, concurrency, and stale-read handling.
 */
import { afterEach, describe, expect, test } from "vitest";
import { deferred } from "../../../test-utils/deferred";
import { cleanupLogger, setupLogger } from "./helpers";

describe("loadLoggingEnabled", () => {
  afterEach(cleanupLogger);

  test("does not overwrite a newer storage change with a stale load", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({ initialLoad: pendingLoad.promise });

    app.storage.emitChange({ "logging-enabled": { newValue: true } });
    app.logger.log("after change");

    pendingLoad.resolve({ "logging-enabled": false });
    await app.loadLoggingEnabled();
    app.logger.log("after stale load");

    expect(app.writes).toEqual([
      ["log", "after change"],
      ["log", "after stale load"],
    ]);
  });

  test("does not disable a newer storage change when a stale load fails", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({
      captureErrors: true,
      initialLoad: pendingLoad.promise,
    });

    app.storage.emitChange({ "logging-enabled": { newValue: true } });
    pendingLoad.reject(new Error("read failed"));
    await expect(app.loadLoggingEnabled()).rejects.toThrow("read failed");
    app.logger.log("still enabled");

    expect(app.writes).toEqual([["log", "still enabled"]]);
  });

  test("shares an active load and starts a fresh load after it settles", async () => {
    const firstLoad = deferred<Record<string, unknown>>();
    const secondLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({ initialLoad: firstLoad.promise });
    app.storage.queueGet(secondLoad.promise);

    const activeLoad = app.loadLoggingEnabled();
    expect(app.loadLoggingEnabled()).toBe(activeLoad);
    expect(app.storage.get).toHaveBeenCalledTimes(1);

    firstLoad.resolve({ "logging-enabled": false });
    await activeLoad;

    const freshLoad = app.loadLoggingEnabled();
    expect(freshLoad).not.toBe(activeLoad);
    secondLoad.resolve({ "logging-enabled": "false" });
    await expect(freshLoad).resolves.toBe(true);
    app.logger.log("enabled by a truthy stored value");

    expect(app.storage.get).toHaveBeenCalledTimes(2);
    expect(app.writes).toEqual([
      ["log", "enabled by a truthy stored value"],
    ]);
  });

  test("does not overwrite a newer local setting with a stale load", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({ initialLoad: pendingLoad.promise });

    await app.setLoggingEnabled(true);
    pendingLoad.resolve({ "logging-enabled": false });
    await app.loadLoggingEnabled();
    app.logger.warn("still enabled");

    expect(app.writes).toEqual([["warn", "still enabled"]]);
  });

  test("disables logging when a fresh read fails", async () => {
    const initialLoad = deferred<Record<string, unknown>>();
    const app = await setupLogger({
      captureErrors: true,
      initialLoad: initialLoad.promise,
    });

    const activeLoad = app.loadLoggingEnabled();
    initialLoad.resolve({ "logging-enabled": true });
    await activeLoad;

    app.storage.queueGet(Promise.reject(new Error("fresh read failed")));
    await expect(app.loadLoggingEnabled()).rejects.toThrow("fresh read failed");
    app.logger.log("disabled after failure");

    expect(app.writes).toEqual([]);
  });
});
