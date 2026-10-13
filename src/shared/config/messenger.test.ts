import { describe, expect, it } from 'vitest';
import { getMessengerConfig, MAX_MESSAGE_LENGTH } from './messenger';

describe('messenger profiles', () => {
  it('retains MAX defaults for existing callers', () => {
    expect(getMessengerConfig()).toMatchObject({
      label: 'MAX',
      instanceType: 'v3',
      maxMessageLength: MAX_MESSAGE_LENGTH,
    });
    expect(MAX_MESSAGE_LENGTH).toBe(4000);
  });

  it('uses the real Telegram instance type and text limit', () => {
    expect(getMessengerConfig('telegram')).toMatchObject({
      label: 'Telegram',
      instanceType: 'telegram',
      maxMessageLength: 4096,
      webUrl: 'https://web.telegram.org/',
      docsUrl: 'https://green-api.com/telegram/docs/before-start/',
    });
  });
});
