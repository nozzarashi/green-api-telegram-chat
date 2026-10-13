export type Messenger = 'telegram';

export interface MessengerConfig {
  readonly label: 'Telegram';
  readonly instanceType: 'telegram';
  readonly maxMessageLength: 4096;
  readonly webUrl: string;
  readonly docsUrl: string;
  readonly phoneHint: string;
}

export const TELEGRAM_MESSAGE_LENGTH = 4096;

const MESSENGER_CONFIGS: Readonly<Record<Messenger, MessengerConfig>> = {
  telegram: {
    label: 'Telegram',
    instanceType: 'telegram',
    maxMessageLength: TELEGRAM_MESSAGE_LENGTH,
    webUrl: 'https://web.telegram.org/',
    docsUrl: 'https://green-api.com/telegram/docs/before-start/',
    phoneHint: 'Международный формат, например +44 7911 123456',
  },
};

export function getMessengerConfig(messenger: Messenger = 'telegram'): MessengerConfig {
  return MESSENGER_CONFIGS[messenger];
}
