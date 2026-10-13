import type { InstanceState } from '../../../shared/api';

export type MessageDirection = 'incoming' | 'outgoing';
const DELIVERY_STATUSES = ['delivered', 'read', 'failed', 'noAccount', 'notInGroup'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type MessageStatus = 'queued' | 'sending' | DeliveryStatus;

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === 'string' && DELIVERY_STATUSES.some((status) => status === value);
}

export interface ChatMessage {
  id: string;
  chatId: string;
  text: string;
  direction: MessageDirection;
  /** UNIX timestamp in seconds, as provided by GREEN-API. */
  timestamp: number;
  senderName?: string;
}

export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  | {
      type: 'status';
      id: string;
      chatId: string;
      status: DeliveryStatus;
      description?: string;
      timestamp: number;
    }
  | { type: 'account'; state: InstanceState; timestamp: number };
