/**
 * Records console calls for tests that need to inspect ordered output.
 */
import { vi } from 'vitest';

/**
 * Selects the console methods captured by default.
 */
const defaultMethods: readonly ConsoleMethod[] = ['log', 'info', 'warn', 'error'];

export type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';
export type ConsoleWrite = [method: ConsoleMethod, ...args: unknown[]];

/**
 * Captures calls to the requested console methods in their original order.
 */
export function captureConsole(methods = defaultMethods) {
  const writes: ConsoleWrite[] = [];

  for (const method of methods) {
    vi.spyOn(globalThis.console, method).mockImplementation((...args) => {
      writes.push([method, ...args]);
    });
  }

  return writes;
}
