export type Messenger = 'max' | 'telegram';

export interface MessengerConfig {
  readonly label: 'MAX' | 'Telegram';
  readonly instanceType: 'v3' | 'telegram';
  readonly maxMessageLength: 4000 | 4096;
  readonly webUrl: string;
  readonly docsUrl: string;
  readonly phoneHint: string;
}

/** Retained for callers that specifically implement MAX. */
export const MAX_MESSAGE_LENGTH = 4000;

const MESSENGER_CONFIGS: Readonly<Record<Messenger, MessengerConfig>> = {
  max: {
    label: 'MAX',
    instanceType: 'v3',
    maxMessageLength: MAX_MESSAGE_LENGTH,
    webUrl: 'https://web.max.ru/',
    docsUrl: 'https://green-api.com/v3/docs/before-start/',
    phoneHint: 'РФ (+7) или Беларусь (+375)',
  },
  telegram: {
    label: 'Telegram',
    instanceType: 'telegram',
    maxMessageLength: 4096,
    webUrl: 'https://web.telegram.org/',
    docsUrl: 'https://green-api.com/telegram/docs/before-start/',
    phoneHint: 'Номер в международном формате, например +7 999 123-45-67',
  },
};

export function getMessengerConfig(messenger: Messenger = 'max'): MessengerConfig {
  return MESSENGER_CONFIGS[messenger];
}
