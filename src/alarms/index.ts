/**
 * Registers named WebExtension alarms while preserving existing schedules.
 */

/**
 * Registers a name-filtered listener immediately and exposes alarm initialization completion.
 */
export function setupAlarm(
  name: string,
  params: chrome.alarms.AlarmCreateInfo,
  listener?: (alarm: chrome.alarms.Alarm) => void,
) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === name) {
      listener?.(alarm);
    }
  });

  return ensureAlarm(name, params);
}

/**
 * Creates a missing named alarm without modifying an existing alarm.
 */
export async function ensureAlarm(name: string, params: chrome.alarms.AlarmCreateInfo) {
  const alarm = await chrome.alarms.get(name);

  if (!alarm) {
    await chrome.alarms.create(name, params);
  }
}
