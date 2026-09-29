/**
 * Verifies event payloads and fixed configuration.
 */
import { expect, test, vi } from 'vitest';
import { createGoogleAnalytics, type GoogleAnalyticsOptions } from '../index';
import {
  client,
  payload,
  config,
  requests,
  failures,
  fetchMock,
  getStorage,
  setStorage,
  type Events,
} from './helpers';

test('sends one typed event with extension context and user agent', async () => {
  expect(await client().sendEvent('changed', { value: true, omitted: undefined })).toBe(true);
  expect(JSON.parse(requests[0].body)).toEqual({
    client_id: '123.456',
    user_agent: 'Example Browser',
    events: [
      {
        name: 'changed',
        params: {
          value: true,
          content_group: 'background',
          extension_version: '1.2.3',
          session_id: '1800000000000',
          engagement_time_msec: 100,
        },
      },
    ],
  });
  expect(new URL(requests[0].url).searchParams.get('api_secret')).toBe('secret');
});

test('uses a simple CORS request without requiring host permission', async () => {
  await client().sendEvent('opened');
  const [url, init] = fetchMock.mock.calls[0];
  const request = new Request(url, init);
  expect(request.method).toBe('POST');
  expect(request.mode).toBe('cors');
  expect([...request.headers]).toEqual([['content-type', 'text/plain;charset=UTF-8']]);
});

test.each(['measurementId', 'apiSecret', 'clientId'] as const)(
  'rejects invalid %s during creation',
  (key) => {
    for (const value of [undefined, '', '  ', 123]) {
      expect(() => client({ [key]: value } as Partial<GoogleAnalyticsOptions>)).toThrow(key);
    }
    expect(requests).toEqual([]);
    expect(getStorage).not.toHaveBeenCalled();
  },
);

test('disabled clients skip all storage and network work', async () => {
  const analytics = client({ enabled: false });
  expect(await analytics.sendEvent('opened')).toBe(false);
  expect(await analytics.sendException('example')).toBe(false);
  expect(getStorage).not.toHaveBeenCalled();
  expect(setStorage).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
  expect(failures).toEqual([]);
});

test.each(['/', '/options/index.html', '/options/index.html?tab=general#theme'])(
  'reports document path %s',
  async (path) => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', new URL(`chrome-extension://example${path}`));
    const analytics = client();
    await analytics.sendEvent('opened');
    await analytics.sendException('example');
    for (const request of requests) {
      const params = JSON.parse(request.body).events[0].params;
      expect(params.content_group).toBe(new URL(`chrome-extension://example${path}`).pathname);
    }
  },
);

test('preserves the full page-view URL while grouping by pathname', async () => {
  const url = 'chrome-extension://example/options/index.html?tab=general#theme';
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', new URL(url));
  const analytics = createGoogleAnalytics<{
    name: 'page_view';
    params: { page_location: string; page_title: string };
  }>(config);
  await analytics.sendEvent('page_view', {
    page_location: url,
    page_title: 'Options',
  });
  expect(payload()).toMatchObject({
    page_location: url,
    page_title: 'Options',
    content_group: '/options/index.html',
  });
});

test('keeps the last 100 characters of the content group pathname', async () => {
  const path = '/' + 'a'.repeat(150) + '/index.html';
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', new URL(`chrome-extension://example${path}`));
  await client().sendEvent('opened');
  expect(payload().content_group).toBe('a'.repeat(89) + '/index.html');
});

test('module metadata overrides caller values including disabled debug mode', async () => {
  const analytics = createGoogleAnalytics<{
    name: 'opened';
    params: Record<string, string | number | boolean>;
  }>(config);
  await analytics.sendEvent('opened', {
    content_group: 'other',
    session_id: 'other',
    extension_version: 'other',
    engagement_time_msec: 50,
    debug_mode: true,
  });
  expect(payload()).toMatchObject({
    content_group: 'background',
    extension_version: '1.2.3',
    engagement_time_msec: 100,
  });
  expect(payload().session_id).not.toBe('other');
  expect(payload().debug_mode).toBeUndefined();
});

test('debug mode uses the normal endpoint and snapshots configuration', async () => {
  const options = { ...config, debug: true };
  const analytics = createGoogleAnalytics<Events>(options);
  options.debug = false;
  options.clientId = 'other';
  await analytics.sendEvent('opened');
  expect(requests[0].url).toContain('/mp/collect?');
  expect(payload().debug_mode).toBe(true);
  expect(JSON.parse(requests[0].body).client_id).toBe('123.456');
});
