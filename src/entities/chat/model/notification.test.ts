import { describe, expect, it } from 'vitest';
import { parseNotification } from './notification';

const body = {
  typeWebhook: 'incomingMessageReceived',
  timestamp: 1763115112,
  idMessage: 'message-1',
  senderData: { chatId: '12345', senderName: 'Анна', senderContactName: 'Анна (контакт)' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
};

describe('Telegram notification normalization', () => {
  it('parses incoming text and keeps the server chat ID and UNIX seconds', () => {
    expect(parseNotification(body)).toEqual({
      type: 'message',
      message: {
        id: 'message-1',
        chatId: '12345',
        text: 'Привет',
        timestamp: 1763115112,
        direction: 'incoming',
        senderName: 'Анна (контакт)',
      },
    });
  });

  it('parses texts containing URLs rather than discarding them as media', () => {
    expect(
      parseNotification({
        ...body,
        messageData: {
          typeMessage: 'extendedTextMessage',
          extendedTextMessageData: { text: 'Ссылка https://example.com' },
        },
      }),
    ).toMatchObject({ type: 'message', message: { text: 'Ссылка https://example.com' } });
  });

  it.each(['outgoingAPIMessageReceived', 'outgoingMessageReceived'])(
    'parses %s as outgoing',
    (typeWebhook) => {
      expect(parseNotification({ ...body, typeWebhook })).toMatchObject({
        type: 'message',
        message: { direction: 'outgoing', id: 'message-1' },
      });
    },
  );

  it.each(['delivered', 'read', 'failed', 'noAccount', 'notInGroup'])(
    'handles %s status',
    (status) => {
      expect(
        parseNotification({
          typeWebhook: 'outgoingMessageStatus',
          idMessage: 'message-1',
          chatId: '12345',
          timestamp: 1763115112,
          status,
          description: 'details',
        }),
      ).toEqual({
        type: 'status',
        id: 'message-1',
        chatId: '12345',
        timestamp: 1763115112,
        status,
        description: 'details',
      });
    },
  );

  it('parses account state notifications', () => {
    expect(
      parseNotification({
        typeWebhook: 'stateInstanceChanged',
        timestamp: 1763115112,
        stateInstance: 'notAuthorized',
      }),
    ).toEqual({ type: 'account', state: 'notAuthorized', timestamp: 1763115112 });
  });

  it.each([
    null,
    [],
    'invalid',
    { ...body, timestamp: Number.NaN },
    { ...body, senderData: {} },
    { ...body, messageData: { typeMessage: 'imageMessage' } },
  ])('ignores unsupported or malformed payload %#', (input) => {
    expect(parseNotification(input)).toBeNull();
  });
});
