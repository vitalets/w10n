/**
 * Initializes optional background analytics with a persistent installation identity.
 */
import { createGoogleAnalytics } from '../w10n/google-analytics';
import { logger } from '../w10n/logger';
import { storage } from '../w10n/storage';

/**
 * Persists the installation identity used by optional analytics.
 */
const clientId = new storage.local.Item('analyticsClientId', '');

type OptionsOpenedEvent = { name: 'options_opened'; params: { source: 'context_menu' } };

/**
 * Shares optional analytics initialization with event handlers.
 */
export const analyticsReady = initAnalytics();

/**
 * Enables analytics only when local configuration supplies both credentials.
 */
async function initAnalytics() {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  const apiSecret = import.meta.env.VITE_GA_API_SECRET?.trim();
  if (!measurementId || !apiSecret) return;
  try {
    const installationId = await clientId.set((current) => current || crypto.randomUUID());
    const analytics = createGoogleAnalytics<OptionsOpenedEvent>({
      measurementId,
      apiSecret,
      clientId: installationId,
      onError: (failure) => logger.warn('Analytics delivery failed', failure),
    });
    analytics.captureExceptions();
    return analytics;
  } catch (error) {
    logger.error('Could not initialize analytics', error);
  }
}
