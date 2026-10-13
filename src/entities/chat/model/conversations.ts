import type { ChatEvent, DeliveryStatus } from './types';

export type ConversationMessageStatus =
  'sending' | 'queued' | 'delivered' | 'read' | 'failed' | 'unknown';
export interface ConversationMessage {
  id: string;
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
  status: ConversationMessageStatus;
  error?: string;
}
export interface Conversation {
  id: string;
  phone?: string;
  name: string;
  messages: ConversationMessage[];
  unreadCount: number;
  draft: string;
}
export interface ConversationsState {
  chats: Conversation[];
  activeChatId: string | null;
  /** A status may precede the sendMessage response that provides its ID. */
  pendingStatuses: Record<string, { status: DeliveryStatus; chatId: string }>;
}
export const initialConversationsState: ConversationsState = {
  chats: [],
  activeChatId: null,
  pendingStatuses: {},
};
export type ConversationAction =
  | { type: 'create'; chat: { id: string; name: string; phone: string } }
  | { type: 'select'; id: string }
  | { type: 'draft'; chatId: string; text: string }
  | { type: 'pending'; chatId: string; message: ConversationMessage; clearDraft: boolean }
  | { type: 'accepted'; chatId: string; temporaryId: string; id: string }
  | { type: 'failed'; chatId: string; id: string; error: string; uncertain: boolean }
  | { type: 'event'; event: ChatEvent };

function normalizeStatus(status: DeliveryStatus): ConversationMessageStatus {
  return status === 'noAccount' || status === 'notInGroup' ? 'failed' : status;
}
function advanceStatus(
  current: ConversationMessageStatus,
  next: ConversationMessageStatus,
): ConversationMessageStatus {
  if (current === 'read') return current;
  if (current === 'delivered' && next !== 'read') return current;
  if (current === 'failed' && ['sending', 'queued', 'unknown'].includes(next)) return current;
  return next;
}
function statusKey(chatId: string, messageId: string): string {
  return `${chatId}:${messageId}`;
}
function deliveryError(status: DeliveryStatus): string {
  if (status === 'noAccount') return 'Получатель не зарегистрирован в MAX.';
  if (status === 'notInGroup') return 'Вы не участвуете в этой группе MAX.';
  return 'MAX не доставил сообщение. Попробуйте ещё раз.';
}
function mapChat(
  state: ConversationsState,
  id: string,
  update: (chat: Conversation) => Conversation,
): ConversationsState {
  return { ...state, chats: state.chats.map((chat) => (chat.id === id ? update(chat) : chat)) };
}
export function conversationsReducer(
  state: ConversationsState,
  action: ConversationAction,
): ConversationsState {
  switch (action.type) {
    case 'create': {
      const existing = state.chats.find((chat) => chat.id === action.chat.id);
      const chats = existing
        ? state.chats.map((chat) =>
            chat.id === existing.id ? { ...chat, phone: action.chat.phone, unreadCount: 0 } : chat,
          )
        : [...state.chats, { ...action.chat, messages: [], unreadCount: 0, draft: '' }];
      return { ...state, chats, activeChatId: action.chat.id };
    }
    case 'select':
      return state.chats.some((chat) => chat.id === action.id)
        ? {
            ...mapChat(state, action.id, (chat) => ({ ...chat, unreadCount: 0 })),
            activeChatId: action.id,
          }
        : state;
    case 'draft':
      return mapChat(state, action.chatId, (chat) => ({ ...chat, draft: action.text }));
    case 'pending':
      return mapChat(state, action.chatId, (chat) => ({
        ...chat,
        draft: action.clearDraft ? '' : chat.draft,
        messages: chat.messages.some((message) => message.id === action.message.id)
          ? chat.messages.map((message) =>
              message.id === action.message.id ? action.message : message,
            )
          : [...chat.messages, action.message],
      }));
    case 'accepted': {
      const key = statusKey(action.chatId, action.id);
      const pending = state.pendingStatuses[key];
      const result = mapChat(state, action.chatId, (chat) => {
        const optimistic = chat.messages.find((message) => message.id === action.temporaryId);
        if (!optimistic) return chat;
        const echo = chat.messages.find((message) => message.id === action.id);
        const receivedStatus = pending
          ? normalizeStatus(pending.status)
          : (echo?.status ?? 'queued');
        const status = advanceStatus(
          optimistic.status,
          advanceStatus(echo?.status ?? 'queued', receivedStatus),
        );
        const error =
          status === 'failed'
            ? pending
              ? deliveryError(pending.status)
              : (echo?.error ?? 'MAX не доставил сообщение.')
            : undefined;
        return {
          ...chat,
          messages: chat.messages
            .filter((message) => message.id !== action.id || message.id === action.temporaryId)
            .map((message) =>
              message.id === action.temporaryId
                ? {
                    ...message,
                    id: action.id,
                    timestamp: echo?.timestamp ?? message.timestamp,
                    status,
                    error,
                  }
                : message,
            )
            .sort((a, b) => a.timestamp - b.timestamp),
        };
      });
      const pendingStatuses = { ...result.pendingStatuses };
      delete pendingStatuses[key];
      return { ...result, pendingStatuses };
    }
    case 'failed':
      return mapChat(state, action.chatId, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.id === action.id && message.status !== 'read' && message.status !== 'delivered'
            ? { ...message, status: action.uncertain ? 'unknown' : 'failed', error: action.error }
            : message,
        ),
      }));
    case 'event': {
      const event = action.event;
      if (event.type === 'account') return state;
      if (event.type === 'status') {
        const exists = state.chats.some(
          (chat) =>
            chat.id === event.chatId && chat.messages.some((message) => message.id === event.id),
        );
        if (!exists) {
          // Keep a bounded buffer for send-response races, rather than every historic status.
          const key = statusKey(event.chatId, event.id);
          const entries = Object.entries(state.pendingStatuses)
            .filter(([entryKey]) => entryKey !== key)
            .slice(-199);
          const previous = state.pendingStatuses[key];
          const status =
            previous?.status === 'read'
              ? 'read'
              : previous?.status === 'delivered' && event.status !== 'read'
                ? 'delivered'
                : event.status;
          return {
            ...state,
            pendingStatuses: {
              ...Object.fromEntries(entries),
              [key]: { status, chatId: event.chatId },
            },
          };
        }
        return mapChat(state, event.chatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) => {
            if (message.id !== event.id) return message;
            const status = advanceStatus(message.status, normalizeStatus(event.status));
            return {
              ...message,
              status,
              error: status === 'failed' ? deliveryError(event.status) : undefined,
            };
          }),
        }));
      }
      const message = event.message;
      const existingChat = state.chats.find((chat) => chat.id === message.chatId);
      const key = statusKey(message.chatId, message.id);
      const pending = state.pendingStatuses[key];
      const chat: Conversation = existingChat ?? {
        id: message.chatId,
        name: message.senderName || `Чат ${message.chatId}`,
        messages: [],
        unreadCount: 0,
        draft: '',
      };
      const existingMessage = chat.messages.find((item) => item.id === message.id);
      const receivedStatus =
        message.direction === 'incoming'
          ? 'delivered'
          : pending
            ? normalizeStatus(pending.status)
            : (existingMessage?.status ?? 'queued');
      const status = existingMessage
        ? advanceStatus(existingMessage.status, receivedStatus)
        : receivedStatus;
      const incomingMessage: ConversationMessage = {
        id: message.id,
        text: message.text,
        direction: message.direction,
        timestamp: message.timestamp * 1000,
        status,
        error:
          status === 'failed'
            ? pending
              ? deliveryError(pending.status)
              : (existingMessage?.error ?? 'MAX не доставил сообщение.')
            : undefined,
      };
      const updated: Conversation = {
        ...chat,
        name:
          message.direction === 'incoming' && message.senderName ? message.senderName : chat.name,
        messages: existingMessage
          ? chat.messages.map((item) =>
              item.id === message.id
                ? { ...incomingMessage, status: advanceStatus(item.status, status) }
                : item,
            )
          : [...chat.messages, incomingMessage].sort((a, b) => a.timestamp - b.timestamp),
        unreadCount:
          !existingMessage && message.direction === 'incoming' && state.activeChatId !== chat.id
            ? chat.unreadCount + 1
            : chat.unreadCount,
      };
      const pendingStatuses = { ...state.pendingStatuses };
      delete pendingStatuses[key];
      return {
        ...state,
        pendingStatuses,
        chats: existingChat
          ? state.chats.map((item) => (item.id === chat.id ? updated : item))
          : [...state.chats, updated],
      };
    }
  }
}
