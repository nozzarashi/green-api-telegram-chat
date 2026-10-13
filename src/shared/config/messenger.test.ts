import { describe, expect, it } from 'vitest';
import { getMessengerConfig, TELEGRAM_MESSAGE_LENGTH } from './messenger';

describe('Telegram configuration', () => {
  it('uses Telegram by default for all callers', () => {
    expect(getMessengerConfig()).toBe(getMessengerConfig('telegram'));
    expect(TELEGRAM_MESSAGE_LENGTH).toBe(4096);
  });

  it('uses the Telegram instance type, text limit and official links', () => {
    expect(getMessengerConfig('telegram')).toMatchObject({
      label: 'Telegram',
      instanceType: 'telegram',
      maxMessageLength: 4096,
      webUrl: 'https://web.telegram.org/',
      docsUrl: 'https://green-api.com/telegram/docs/before-start/',
    });
  });
});
