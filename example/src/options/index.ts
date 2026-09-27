/**
 * Loads and saves the example's single boolean option through a storage item.
 */
import { logger } from '../w10n/logger';
import { storage } from '../w10n/storage';

const exampleOption = new storage.local.Item('exampleOption', false);
const checkbox = document.querySelector<HTMLInputElement>('#exampleOption')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let savedValue = false;

void initOptions();

/**
 * Enables editing after the persisted option has loaded successfully.
 */
async function initOptions() {
  try {
    savedValue = await exampleOption.get();
    checkbox.checked = savedValue;
    checkbox.addEventListener('change', saveOption);
    checkbox.disabled = false;
    status.textContent = '';
    logger.info('Options opened');
  } catch (error) {
    status.textContent = 'Could not load the option. Reload this page to try again.';
    logger.error('Could not load the option', error);
  }
}

/**
 * Persists the selected value and restores the last saved value on failure.
 */
async function saveOption() {
  const nextValue = checkbox.checked;
  checkbox.disabled = true;
  status.textContent = 'Saving…';
  try {
    savedValue = await exampleOption.set(() => nextValue);
    status.textContent = 'Saved.';
    logger.info('Example option changed', savedValue);
  } catch (error) {
    checkbox.checked = savedValue;
    status.textContent = 'Could not save the option. Please try again.';
    logger.error('Could not save the option', error);
  } finally {
    checkbox.disabled = false;
  }
}
