/**
 * Verifies immediate and persisted changes made through setLoggingEnabled.
 */
import { afterEach, expect, test } from "vitest";
import { cleanupLogger, setupLogger } from "./helpers";

afterEach(cleanupLogger);

test("enables logging and saves the setting", async () => {
  const app = await setupLogger();

  const write = app.setLoggingEnabled(true);
  app.logger.log("foo");
  await write;

  expect(app.storage.values).toEqual({ loggingEnabled: true });
  expect(app.stdout).toEqual([["log", "foo"]]);
});

test("disables logging and saves the setting", async () => {
  const app = await setupLogger({ env: { LOGGING: "1" } });

  const write = app.setLoggingEnabled(false);
  app.logger.log("foo");
  await write;

  expect(app.storage.values).toEqual({ loggingEnabled: false });
  expect(app.stdout).toEqual([]);
});

test("a failed save keeps logging enabled", async () => {
  const app = await setupLogger();
  app.storage.queueSet(Promise.reject(new Error("write failed")));

  const write = app.setLoggingEnabled(true);
  await expect(write).rejects.toThrow("write failed");
  app.logger.log("foo");

  expect(app.storage.values).toEqual({});
  expect(app.stdout).toEqual([["log", "foo"]]);
});

test("a new setting wins over an older load", async () => {
  let resolveLoad!: (value: Record<string, unknown>) => void;
  const pendingLoad = new Promise<Record<string, unknown>>((resolve) => {
    resolveLoad = resolve;
  });
  const app = await setupLogger();
  app.storage.queueGet(pendingLoad);

  const load = app.loadLoggingEnabled();
  await app.setLoggingEnabled(true);
  resolveLoad({ loggingEnabled: false });
  await load;
  app.logger.log("foo");

  expect(app.storage.values).toEqual({ loggingEnabled: true });
  expect(app.stdout).toEqual([["log", "foo"]]);
});
