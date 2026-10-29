/**
 * Runs caller-owned extension upgrade steps in target release order without storing progress.
 */

export type Migration = {
  version: string;
  run: () => Promise<void>;
};

export type MigrationVersions = {
  previousVersion: string;
  currentVersion: string;
};

/**
 * Validates release versions and awaits each applicable upgrade step in order.
 */
export async function runMigrations(migrations: readonly Migration[], versions: MigrationVersions) {
  const selected = selectMigrations(migrations, versions);
  for (const migration of selected) await migration.run();
}

/**
 * Validates every target and selects crossed releases in ascending order.
 */
function selectMigrations(migrations: readonly Migration[], versions: MigrationVersions) {
  const previous = parseVersion(versions.previousVersion);
  const current = parseVersion(versions.currentVersion);
  const targets = migrations.map((migration) => ({
    migration,
    version: parseVersion(migration.version),
  }));
  const selected = targets.filter(
    ({ version }) =>
      sortVersionsAscending(previous, version) < 0 && sortVersionsAscending(version, current) <= 0,
  );
  selected.sort((first, second) => sortVersionsAscending(first.version, second.version));
  return selected.map(({ migration }) => migration);
}

/**
 * Validates a Chrome manifest version and resolves omitted components to zero.
 */
function parseVersion(version: string) {
  const parts = version.split('.');
  if (
    parts.length > 4 ||
    !parts.every(isVersionComponent) ||
    !parts.some((part) => Number(part) > 0)
  ) {
    throw new Error(`Invalid extension version: "${version}"`);
  }
  return Array.from({ length: 4 }, (_, index) => Number(parts[index] ?? 0));
}

/**
 * Orders parsed versions: negative means older, zero equal, and positive newer.
 */
function sortVersionsAscending(first: number[], second: number[]) {
  for (let index = 0; index < 4; index++) {
    const difference = first[index] - second[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Checks that a version component is canonical and within Chrome's numeric range.
 */
function isVersionComponent(part: string) {
  return /^(0|[1-9][0-9]*)$/.exec(part)?.[0] === part && Number(part) <= 65535;
}
