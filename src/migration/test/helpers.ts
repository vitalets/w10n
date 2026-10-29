/**
 * Provides observable migration steps for runner tests.
 */

/**
 * Creates a migration whose completion is observable in the supplied effects.
 */
export function step(version: string, value: string, effects: string[]) {
  return {
    version,
    async run() {
      effects.push(value);
    },
  };
}
