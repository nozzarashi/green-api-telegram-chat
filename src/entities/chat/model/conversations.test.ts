import { describe, expect, it } from 'vitest';
import { conversationsReducer, initialConversationsState } from './conversations';
import type { ConversationMessage, ConversationsState } from './conversations';
import type { ChatEvent, ChatMessage, DeliveryStatus } from './types';

function withChat(
  state: ConversationsState = initialConversationsState,
  id = '12345',
): ConversationsState {
  return conversationsReducer(state, {
    type: 'create',
    chat: { id, name: `Чат ${id}`, phone: '79991234567' },
  });
}

function event(state: ConversationsState, value: ChatEvent): ConversationsState {
  return conversationsReducer(state, { type: 'event', event: value });
}

function incoming(overrides: Partial<ChatMessage> = {}): ChatEvent {
  return {
    type: 'message',
    message: {
      id: 'message-1',
      chatId: '12345',
      text: 'Привет',
      timestamp: 100,
      direction: 'incoming',
      senderName: 'Анна',
      ...overrides,
    },
  };
}

function status(value: DeliveryStatus, id = 'message-1', chatId = '12345'): ChatEvent {
  return { type: 'status', id, chatId, status: value, timestamp: 100 };
}

function pending(state: ConversationsState, chatId = '12345', id = 'local-1'): ConversationsState {
  const message: ConversationMessage = {
    id,
    text: 'Сообщение',
    direction: 'outgoing',
    timestamp: 100_050,
    status: 'sending',
  };
  return conversationsReducer(state, { type: 'pending', chatId, message, clearDraft: true });
}

describe('conversation reducer concurrency', () => {
  it('closes a conversation without losing its draft or message history', () => {
    let state = event(withChat(), incoming());
    state = conversationsReducer(state, { type: 'draft', chatId: '12345', text: 'Продолжу позже' });
    const closed = conversationsReducer(state, { type: 'close' });
    expect(closed.activeChatId).toBeNull();
    expect(closed.chats).toBe(state.chats);
    expect(closed.chats[0]).toMatchObject({
      draft: 'Продолжу позже',
      messages: [{ id: 'message-1', text: 'Привет' }],
    });
  });

  it('counts new incoming messages after returning to the list and clears unread on reopening', () => {
    const closed = conversationsReducer(withChat(), { type: 'close' });
    const received = event(closed, incoming());
    expect(received.activeChatId).toBeNull();
    expect(received.chats[0]?.unreadCount).toBe(1);
    const selected = conversationsReducer(received, { type: 'select', id: '12345' });
    expect(selected.activeChatId).toBe('12345');
    expect(selected.chats[0]?.unreadCount).toBe(0);
    expect(selected.chats[0]?.messages).toEqual(received.chats[0]?.messages);
  });

  it('reopens the existing conversation from phone resolution and preserves its draft', () => {
    let state = conversationsReducer(withChat(), {
      type: 'draft',
      chatId: '12345',
      text: 'Черновик',
    });
    state = conversationsReducer(state, { type: 'close' });
    state = event(state, incoming());
    const reopened = withChat(state);
    expect(reopened.activeChatId).toBe('12345');
    expect(reopened.chats).toHaveLength(1);
    expect(reopened.chats[0]).toMatchObject({ draft: 'Черновик', unreadCount: 0 });
    expect(reopened.chats[0]?.messages).toEqual(state.chats[0]?.messages);
  });

  it('deduplicates repeated incoming receipts and increments unread only once', () => {
    const before = withChat(withChat(), '67890');
    const once = event(before, incoming());
    const twice = event(once, incoming());
    expect(twice.chats.find((chat) => chat.id === '12345')).toMatchObject({
      unreadCount: 1,
      messages: [{ id: 'message-1' }],
    });
    expect(twice.activeChatId).toBe('67890');
    expect(before.chats.find((chat) => chat.id === '12345')?.messages).toEqual([]);
    const selected = conversationsReducer(twice, { type: 'select', id: '12345' });
    expect(selected.chats.find((chat) => chat.id === '12345')?.unreadCount).toBe(0);
  });

  it('adds an unknown incoming chat without switching away from the active conversation', () => {
    const state = event(withChat(), incoming({ chatId: '99999' }));
    expect(state.activeChatId).toBe('12345');
    expect(state.chats.find((chat) => chat.id === '99999')).toMatchObject({
      name: 'Анна',
      unreadCount: 1,
    });
  });

  it('keeps an incoming receipt when phone resolution finishes creating the same chat', () => {
    const received = event(initialConversationsState, incoming());
    const created = withChat(received);
    expect(created.chats).toHaveLength(1);
    expect(created.chats[0]).toMatchObject({
      id: '12345',
      phone: '79991234567',
      name: 'Анна',
      unreadCount: 0,
    });
    expect(created.chats[0]?.messages).toHaveLength(1);
  });

  it('merges the API echo that arrives before sendMessage resolves into one outgoing message', () => {
    const optimistic = pending(withChat());
    const echoed = event(optimistic, incoming({ direction: 'outgoing', text: 'Сообщение' }));
    const accepted = conversationsReducer(echoed, {
      type: 'accepted',
      chatId: '12345',
      temporaryId: 'local-1',
      id: 'message-1',
    });
    expect(accepted.chats[0]?.messages).toEqual([
      {
        id: 'message-1',
        text: 'Сообщение',
        direction: 'outgoing',
        timestamp: 100_000,
        status: 'queued',
        error: undefined,
      },
    ]);
    const repeatedEcho = event(accepted, incoming({ direction: 'outgoing', text: 'Сообщение' }));
    expect(repeatedEcho.chats[0]?.messages).toHaveLength(1);
  });

  it('applies a read status arriving before the send response and never downgrades it', () => {
    let state = pending(withChat());
    state = event(state, status('read'));
    state = event(state, status('delivered'));
    state = conversationsReducer(state, {
      type: 'accepted',
      chatId: '12345',
      temporaryId: 'local-1',
      id: 'message-1',
    });
    expect(state.chats[0]?.messages[0]?.status).toBe('read');
    expect(state.pendingStatuses).toEqual({});
    state = event(state, status('delivered'));
    state = event(state, status('failed'));
    state = event(state, incoming({ direction: 'outgoing' }));
    expect(state.chats[0]?.messages[0]).toMatchObject({ status: 'read', error: undefined });
  });

  it('keeps read status from the echo when merging an older buffered delivery status', () => {
    let state = pending(withChat());
    state = event(state, incoming({ direction: 'outgoing' }));
    state = event(state, status('read'));
    state = conversationsReducer(state, {
      type: 'accepted',
      chatId: '12345',
      temporaryId: 'local-1',
      id: 'message-1',
    });
    expect(state.chats[0]?.messages).toHaveLength(1);
    expect(state.chats[0]?.messages[0]?.status).toBe('read');
  });

  it('namespaces buffered statuses by chat when message IDs happen to coincide', () => {
    let state = pending(pending(withChat(withChat(), '67890')), '67890', 'local-2');
    state = event(state, status('read'));
    state = event(state, status('noAccount', 'message-1', '67890'));
    state = conversationsReducer(state, {
      type: 'accepted',
      chatId: '12345',
      temporaryId: 'local-1',
      id: 'message-1',
    });
    state = conversationsReducer(state, {
      type: 'accepted',
      chatId: '67890',
      temporaryId: 'local-2',
      id: 'message-1',
    });
    expect(state.chats.find((chat) => chat.id === '12345')?.messages[0]?.status).toBe('read');
    expect(state.chats.find((chat) => chat.id === '67890')?.messages[0]).toMatchObject({
      status: 'failed',
      error: 'Получатель недоступен. Проверьте регистрацию и доступность поиска по телефону.',
    });
    expect(state.pendingStatuses).toEqual({});
  });

  it('does not replace known delivery with a late request failure', () => {
    let state = event(withChat(), incoming({ direction: 'outgoing' }));
    state = event(state, status('delivered'));
    state = conversationsReducer(state, {
      type: 'failed',
      chatId: '12345',
      id: 'message-1',
      error: 'Timeout',
      uncertain: true,
    });
    expect(state.chats[0]?.messages[0]).toMatchObject({ status: 'delivered', error: undefined });
  });

  it('keeps a newly typed draft when an earlier message is accepted', () => {
    let state = pending(withChat());
    state = conversationsReducer(state, {
      type: 'draft',
      chatId: '12345',
      text: 'Следующее сообщение',
    });
    state = conversationsReducer(state, {
      type: 'accepted',
      chatId: '12345',
      temporaryId: 'local-1',
      id: 'message-1',
    });
    expect(state.chats[0]?.draft).toBe('Следующее сообщение');
  });

  it('sorts new receipts chronologically and converts UNIX seconds to milliseconds', () => {
    let state = event(withChat(), incoming({ timestamp: 101 }));
    state = event(state, incoming({ id: 'older', timestamp: 99 }));
    expect(state.chats[0]?.messages.map((message) => [message.id, message.timestamp])).toEqual([
      ['older', 99_000],
      ['message-1', 101_000],
    ]);
  });

  it('bounds unmatched status retention and ignores selection of nonexistent chats', () => {
    let state = withChat();
    for (let index = 0; index < 250; index += 1)
      state = event(state, status('delivered', `historic-${index}`));
    expect(Object.keys(state.pendingStatuses)).toHaveLength(200);
    expect(conversationsReducer(state, { type: 'select', id: 'missing' })).toBe(state);
  });
});
