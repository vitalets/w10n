/**
 * Validates and refreshes persisted analytics session activity.
 */
/**
 * Limits inactivity before a new analytics session begins.
 */
const SESSION_IDLE_MS = 30 * 60_000;
type Session = { sessionId: string; timestamp: number };

/**
 * Refreshes shared session activity after earlier operations in this client settle.
 */
export async function refreshSession(key: string) {
  const values = await chrome.storage.session.get(key);
  const now = Date.now();
  const stored: unknown = values[key];
  const session =
    isSession(stored) && stored.timestamp <= now && now - stored.timestamp <= SESSION_IDLE_MS
      ? { sessionId: stored.sessionId, timestamp: now }
      : { sessionId: String(now), timestamp: now };
  await chrome.storage.session.set({ [key]: session });
  return session.sessionId;
}

/**
 * Recognizes a persisted numeric session identity with a valid activity timestamp.
 */
function isSession(value: unknown): value is Session {
  if (value === null || typeof value !== 'object') return false;
  const session = value as Partial<Session>;
  return isSessionId(session.sessionId) && isTimestamp(session.timestamp);
}

/**
 * Recognizes positive numeric session identifiers.
 */
function isSessionId(value: unknown) {
  return (
    typeof value === 'string' &&
    /^\d+$/.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

/**
 * Recognizes finite non-negative activity timestamps.
 */
function isTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
