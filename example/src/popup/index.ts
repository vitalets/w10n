/**
 * Opens the example's options page from the popup.
 */
import { withErrorStack } from '../w10n/errors';
import { logger } from '../w10n/logger';

const button = document.querySelector<HTMLButtonElement>('#openOptions')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

button.addEventListener('click', openOptions);
logger.info('Popup opened');

/**
 * Opens options while showing any browser failure in the popup.
 */
async function openOptions() {
  button.disabled = true;
  status.textContent = '';
  try {
    await withErrorStack(() => chrome.runtime.openOptionsPage());
  } catch (error) {
    status.textContent = 'Could not open options. Please try again.';
    logger.error('Could not open options', error);
  } finally {
    button.disabled = false;
  }
}
