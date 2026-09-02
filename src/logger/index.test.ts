import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function installChromeStorage(
  getResult:
    | Promise<Record<string, unknown>>
    | (() => Promise<Record<string, unknown>>),
  setPromise: Promise<void> = Promise.resolve(),
) {
  const listeners: Array<Parameters<typeof chrome.storage.onChanged.addListener>[0]> = [];
  const get = vi.fn(() =>
    typeof getResult === "function" ? getResult() : getResult,
  );
  const set = vi.fn(() => setPromise);

  vi.stubGlobal("chrome", {
    storage: {
      local: { get, set },
      onChanged: {
        addListener: vi.fn((listener) => listeners.push(listener)),
      },
    },
  } as unknown as typeof chrome);

  return { get, listeners, set };
}

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("LOGGING_ENABLED", "false");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("buffers writes until stored logging is enabled", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    installChromeStorage(pendingLoad.promise);
    const writes: Array<[string, ...unknown[]]> = [];
    vi.spyOn(console, "log").mockImplementation((...args) =>
      writes.push(["log", ...args]),
    );
    vi.spyOn(console, "warn").mockImplementation((...args) =>
      writes.push(["warn", ...args]),
    );
    vi.spyOn(console, "error").mockImplementation((...args) =>
      writes.push(["error", ...args]),
    );
    const { loadLoggingEnabled, logger } = await import("./index");

    logger.log("started", 1);
    logger.warn("warming up");
    logger.error("not ready");
    expect(writes).toEqual([]);

    pendingLoad.resolve({ "logging-enabled": true });
    await loadLoggingEnabled();

    expect(writes).toEqual([
      ["log", "started", 1],
      ["warn", "warming up"],
      ["error", "not ready"],
    ]);
  });

  test.each(["true", "1"])(
    "writes every log level immediately when logging is forced with %s",
    async (envValue) => {
      vi.stubEnv("LOGGING_ENABLED", envValue);
      installChromeStorage(new Promise(() => undefined));
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const { enabledByEnv, logger } = await import("./index");
      logger.log("log");
      logger.info("info", 1);
      logger.warn("warn", { id: 2 });
      logger.error("error", new Error("failure"));

      expect(enabledByEnv).toBe(true);
      expect(log).toHaveBeenCalledWith("log");
      expect(info).toHaveBeenCalledWith("info", 1);
      expect(warn).toHaveBeenCalledWith("warn", { id: 2 });
      expect(error).toHaveBeenCalledWith("error", expect.any(Error));
    },
  );

  test("accepts a boolean force flag injected by a bundler", async () => {
    (import.meta.env as Record<string, unknown>).LOGGING_ENABLED = true;
    installChromeStorage(new Promise(() => undefined));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { enabledByEnv, logger } = await import("./index");
    logger.log("forced");

    expect(enabledByEnv).toBe(true);
    expect(log).toHaveBeenCalledWith("forced");
  });

  test.each(["false", "0", "", undefined])(
    "does not force logging with %s",
    async (envValue) => {
      vi.stubEnv("LOGGING_ENABLED", envValue);
      installChromeStorage(new Promise(() => undefined));
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const { enabledByEnv, logger } = await import("./index");
      logger.log("buffered");

      expect(enabledByEnv).toBe(false);
      expect(log).not.toHaveBeenCalled();
    },
  );

  test("follows logging changes from local storage", async () => {
    const { listeners } = installChromeStorage(
      Promise.resolve({ "logging-enabled": false }),
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger } = await import("./index");
    await loadLoggingEnabled();

    logger.info("disabled");
    listeners[0]?.(
      { "logging-enabled": { newValue: true } },
      "local",
    );
    logger.info("enabled");
    listeners[0]?.(
      { "logging-enabled": { newValue: false } },
      "sync",
    );
    logger.info("still enabled");
    listeners[0]?.(
      { "logging-enabled": { newValue: undefined } },
      "local",
    );
    logger.info("disabled again");

    expect(info.mock.calls).toEqual([["enabled"], ["still enabled"]]);
  });

  test("changes logging immediately without rolling back a failed write", async () => {
    const pendingWrite = deferred<void>();
    const { set } = installChromeStorage(
      Promise.resolve({ "logging-enabled": false }),
      pendingWrite.promise,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger, setLoggingEnabled } = await import(
      "./index"
    );
    await loadLoggingEnabled();

    const write = setLoggingEnabled(true);
    logger.warn("before rejection");
    expect(set).toHaveBeenCalledWith({ "logging-enabled": true });

    pendingWrite.reject(new Error("storage unavailable"));
    await expect(write).rejects.toThrow("storage unavailable");
    logger.warn("after rejection");

    expect(warn.mock.calls).toEqual([
      ["before rejection"],
      ["after rejection"],
    ]);
  });

  test("does not let a stale load overwrite a newer storage change", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const { listeners } = installChromeStorage(pendingLoad.promise);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger } = await import("./index");

    listeners[0]?.(
      { "logging-enabled": { newValue: true } },
      "local",
    );
    logger.log("after change");

    pendingLoad.resolve({ "logging-enabled": false });
    await loadLoggingEnabled();
    logger.log("after stale load");

    expect(log.mock.calls).toEqual([["after change"], ["after stale load"]]);
  });

  test("reports a missing storage API asynchronously without blocking import", async () => {
    const queuedErrors: Array<() => void> = [];
    vi.stubGlobal("queueMicrotask", (callback: () => void) => {
      queuedErrors.push(callback);
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { logger } = await import("./index");
    logger.log("discarded");
    await vi.waitFor(() => expect(queuedErrors).toHaveLength(1));

    expect(log).not.toHaveBeenCalled();
    expect(() => queuedErrors[0]!()).toThrow(/chrome\.storage/);
  });

  test("keeps a setting change when persistence is unavailable", async () => {
    vi.stubGlobal("queueMicrotask", vi.fn());
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { logger, setLoggingEnabled } = await import("./index");

    const write = setLoggingEnabled(true);
    logger.error("enabled in memory");

    await expect(write).rejects.toThrow(/chrome\.storage/);
    expect(error).toHaveBeenCalledWith("enabled in memory");
  });

  test("does not let a failed load disable a newer storage change", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    const { listeners } = installChromeStorage(pendingLoad.promise);
    vi.stubGlobal("queueMicrotask", vi.fn());
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger } = await import("./index");

    listeners[0]?.(
      { "logging-enabled": { newValue: true } },
      "local",
    );
    pendingLoad.reject(new Error("read failed"));
    await expect(loadLoggingEnabled()).rejects.toThrow("read failed");
    logger.log("still enabled");

    expect(log).toHaveBeenCalledWith("still enabled");
  });

  test("shares an active load and starts a fresh load after it settles", async () => {
    const firstLoad = deferred<Record<string, unknown>>();
    const secondLoad = deferred<Record<string, unknown>>();
    const reads = [firstLoad.promise, secondLoad.promise];
    const { get } = installChromeStorage(() => reads.shift()!);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger } = await import("./index");

    const activeLoad = loadLoggingEnabled();
    expect(loadLoggingEnabled()).toBe(activeLoad);
    expect(get).toHaveBeenCalledTimes(1);

    firstLoad.resolve({ "logging-enabled": false });
    await activeLoad;

    const freshLoad = loadLoggingEnabled();
    expect(freshLoad).not.toBe(activeLoad);
    secondLoad.resolve({ "logging-enabled": "false" });
    await expect(freshLoad).resolves.toBe(true);
    logger.log("enabled by a truthy stored value");

    expect(get).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("enabled by a truthy stored value");
  });

  test("does not let a stale load overwrite a newer local setting", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    installChromeStorage(pendingLoad.promise);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger, setLoggingEnabled } = await import(
      "./index"
    );

    await setLoggingEnabled(true);
    pendingLoad.resolve({ "logging-enabled": false });
    await loadLoggingEnabled();
    logger.warn("still enabled");

    expect(warn).toHaveBeenCalledWith("still enabled");
  });

  test("discards buffered writes and reports a failed storage read", async () => {
    const pendingLoad = deferred<Record<string, unknown>>();
    installChromeStorage(pendingLoad.promise);
    const queuedErrors: Array<() => void> = [];
    vi.stubGlobal("queueMicrotask", (callback: () => void) => {
      queuedErrors.push(callback);
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger } = await import("./index");

    logger.log("buffered");
    pendingLoad.reject(new Error("read failed"));
    await expect(loadLoggingEnabled()).rejects.toThrow("read failed");
    logger.log("after failure");

    expect(log).not.toHaveBeenCalled();
    expect(queuedErrors).toHaveLength(1);
    expect(() => queuedErrors[0]!()).toThrow("read failed");
  });

  test("disables logging when a fresh storage read fails", async () => {
    const initialLoad = deferred<Record<string, unknown>>();
    let readCount = 0;
    installChromeStorage(() =>
      readCount++ === 0
        ? initialLoad.promise
        : Promise.reject(new Error("fresh read failed")),
    );
    vi.stubGlobal("queueMicrotask", vi.fn());
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { loadLoggingEnabled, logger } = await import("./index");
    const activeLoad = loadLoggingEnabled();
    initialLoad.resolve({ "logging-enabled": true });
    await activeLoad;

    await expect(loadLoggingEnabled()).rejects.toThrow("fresh read failed");
    logger.log("disabled after failure");

    expect(log).not.toHaveBeenCalled();
  });
});
