import { isInstanceState } from '../../../shared/api';
import type { ChatEvent } from './types';
import { isDeliveryStatus } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Unsupported or malformed notifications can still be acknowledged by the polling layer. */
export function parseNotification(body: unknown): ChatEvent | null {
  if (
    !isRecord(body) ||
    typeof body.timestamp !== 'number' ||
    !Number.isFinite(body.timestamp) ||
    body.timestamp < 0
  )
    return null;
  const timestamp = body.timestamp;
  if (body.typeWebhook === 'stateInstanceChanged') {
    if (!isInstanceState(body.stateInstance)) return null;
    return { type: 'account', state: body.stateInstance, timestamp };
  }
  const id = string(body.idMessage);
  if (!id) return null;
  if (body.typeWebhook === 'outgoingMessageStatus') {
    const chatId = string(body.chatId);
    if (!chatId || !isDeliveryStatus(body.status)) return null;
    const description = string(body.description);
    return {
      type: 'status',
      id,
      chatId,
      status: body.status,
      timestamp,
      ...(description ? { description } : {}),
    };
  }
  const incoming = body.typeWebhook === 'incomingMessageReceived';
  const outgoing =
    body.typeWebhook === 'outgoingAPIMessageReceived' ||
    body.typeWebhook === 'outgoingMessageReceived';
  if ((!incoming && !outgoing) || !isRecord(body.senderData) || !isRecord(body.messageData))
    return null;
  const chatId = string(body.senderData.chatId);
  if (!chatId) return null;
  const data = body.messageData;
  let text: string | undefined;
  if (data.typeMessage === 'textMessage' && isRecord(data.textMessageData)) {
    text = string(data.textMessageData.textMessage);
  } else if (data.typeMessage === 'extendedTextMessage' && isRecord(data.extendedTextMessageData)) {
    text = string(data.extendedTextMessageData.text);
  }
  if (text === undefined) return null;
  const senderName =
    string(body.senderData.senderContactName) ?? string(body.senderData.senderName);
  return {
    type: 'message',
    message: {
      id,
      chatId,
      text,
      direction: incoming ? 'incoming' : 'outgoing',
      timestamp,
      ...(senderName ? { senderName } : {}),
    },
  };
}
