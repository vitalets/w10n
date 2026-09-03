/**
 * Verifies environment-controlled logger forcing and console method forwarding.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanupLogger, setupLogger } from "./helpers";

describe("enabledByEnv", () => {
  afterEach(cleanupLogger);

  test.each(["true", "1"])(
    "writes every log level when forced with %s",
    async (env) => {
      const app = await setupLogger({
        env,
        initialLoad: new Promise(() => undefined),
      });

      app.logger.log("log");
      app.logger.info("info", 1);
      app.logger.warn("warn", { id: 2 });
      app.logger.error("error", new Error("failure"));

      expect(app.enabledByEnv).toBe(true);
      expect(app.writes).toEqual([
        ["log", "log"],
        ["info", "info", 1],
        ["warn", "warn", { id: 2 }],
        ["error", "error", expect.any(Error)],
      ]);
    },
  );

  test("accepts a boolean injected by a bundler", async () => {
    const app = await setupLogger({
      env: true,
      initialLoad: new Promise(() => undefined),
    });

    app.logger.log("forced");

    expect(app.enabledByEnv).toBe(true);
    expect(app.writes).toEqual([["log", "forced"]]);
  });

  test.each(["false", "0", "", undefined])(
    "does not force logging with %s",
    async (env) => {
      const app = await setupLogger({
        env,
        initialLoad: new Promise(() => undefined),
      });

      app.logger.log("buffered");

      expect(app.enabledByEnv).toBe(false);
      expect(app.writes).toEqual([]);
    },
  );
});
