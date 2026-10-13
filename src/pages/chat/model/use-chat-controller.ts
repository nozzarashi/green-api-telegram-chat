import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ChatEvent } from '@/entities/chat';
import { conversationsReducer, initialConversationsState } from '@/entities/chat';
import type { ConversationMessage } from '@/entities/chat';
import { useReceiveMessages } from '@/features/receive-messages';
import { ApiError } from '@/shared/api';
import type { GreenApi } from '@/shared/api';
import { getMessengerConfig } from '@/shared/config';

export function useChatController(api: GreenApi) {
  const profile = getMessengerConfig(api.messenger);
  const [state, dispatch] = useReducer(conversationsReducer, initialConversationsState);
  const requestsRef = useRef(new Set<AbortController>());
  const sendingChatsRef = useRef(new Set<string>());
  useEffect(() => {
    const requests = requestsRef.current;
    const sending = sendingChatsRef.current;
    return () => {
      requests.forEach((controller) => controller.abort());
      requests.clear();
      sending.clear();
    };
  }, []);
  const onEvent = useCallback((event: ChatEvent) => dispatch({ type: 'event', event }), []);
  const connection = useReceiveMessages(api, onEvent);
  async function send(chatId: string, retryId?: string) {
    const chat = state.chats.find((item) => item.id === chatId);
    const previous = retryId ? chat?.messages.find((message) => message.id === retryId) : undefined;
    if (retryId && (!previous || !['failed', 'unknown'].includes(previous.status))) return;
    const text = previous?.text ?? chat?.draft ?? '';
    if (
      !chat ||
      !text.trim() ||
      text.length > profile.maxMessageLength ||
      sendingChatsRef.current.has(chatId) ||
      connection.status !== 'connected'
    )
      return;
    const controller = new AbortController();
    requestsRef.current.add(controller);
    sendingChatsRef.current.add(chatId);
    const temporaryId = previous?.id ?? `local-${crypto.randomUUID()}`;
    const message: ConversationMessage = {
      id: temporaryId,
      text,
      direction: 'outgoing',
      timestamp: previous?.timestamp ?? Math.floor(Date.now() / 1000) * 1000,
      status: 'sending',
    };
    dispatch({ type: 'pending', chatId, message, clearDraft: !retryId });
    try {
      const result = await api.sendMessage(chatId, text, controller.signal);
      if (!controller.signal.aborted)
        dispatch({ type: 'accepted', chatId, temporaryId, id: result.idMessage });
    } catch (cause: unknown) {
      if (controller.signal.aborted) return;
      const uncertain =
        !(cause instanceof ApiError) ||
        ['network', 'timeout', 'response', 'server'].includes(cause.code);
      dispatch({
        type: 'failed',
        chatId,
        id: temporaryId,
        uncertain,
        error: uncertain
          ? 'Не удалось подтвердить отправку. Сообщение могло уже уйти; повторная отправка может создать дубль.'
          : cause instanceof ApiError
            ? cause.message
            : 'Не удалось отправить сообщение.',
      });
    } finally {
      requestsRef.current.delete(controller);
      sendingChatsRef.current.delete(chatId);
    }
  }
  return {
    state,
    connection,
    createChat: (chat: { id: string; phone: string; name: string }) =>
      dispatch({ type: 'create', chat }),
    selectChat: (id: string) => dispatch({ type: 'select', id }),
    closeChat: () => dispatch({ type: 'close' }),
    changeDraft: (chatId: string, text: string) => dispatch({ type: 'draft', chatId, text }),
    send: (chatId: string) => void send(chatId),
    retry: (chatId: string, id: string) => void send(chatId, id),
  };
}
