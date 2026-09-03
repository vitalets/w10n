/**
 * Verifies logger synchronization with Chrome storage change events.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanupLogger, setupLogger } from "./helpers";

describe("chrome.storage.onChanged", () => {
  afterEach(cleanupLogger);

  test("applies only local changes to the logging setting", async () => {
    const app = await setupLogger({ stored: false });
    await app.loadLoggingEnabled();

    app.logger.info("disabled");
    app.storage.emitChange({ "logging-enabled": { newValue: true } });
    app.logger.info("enabled");
    app.storage.emitChange(
      { "logging-enabled": { newValue: false } },
      "sync",
    );
    app.logger.info("still enabled");
    app.storage.emitChange({ "logging-enabled": { newValue: undefined } });
    app.logger.info("disabled again");

    expect(app.writes).toEqual([
      ["info", "enabled"],
      ["info", "still enabled"],
    ]);
  });
});
