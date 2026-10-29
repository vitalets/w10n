/**
 * Collects the example's migrations and runs steps for the supplied upgrade range.
 */
import { runMigrations, type MigrationVersions } from '../../w10n/migration';
import { migration as convertStringToArrayOfStrings } from './convert-string-to-array-of-strings';

/**
 * Runs the example's applicable upgrade steps in release order.
 */
export function migrate(versions: MigrationVersions) {
  return runMigrations([convertStringToArrayOfStrings], versions);
}
