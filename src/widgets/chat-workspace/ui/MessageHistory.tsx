import { Fragment, useLayoutEffect, useRef } from 'react';
import type { UIEvent } from 'react';
import { Icon } from '@/shared/ui';
import { formatMessageDate, getDateKey } from '../lib/format';
import type { Conversation } from '@/entities/chat';
import { MessageBubble } from './MessageBubble';
import styles from './ChatWorkspace.module.css';

interface MessageHistoryProps {
  chat: Conversation;
  canRetry: boolean;
  onRetry: (messageId: string) => void;
}

export function MessageHistory({ chat, canRetry, onRetry }: MessageHistoryProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageId = chat.messages.at(-1)?.id;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const chatChanged = previousChatIdRef.current !== chat.id;
    if (chatChanged || stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
      stickToBottomRef.current = true;
    }
    previousChatIdRef.current = chat.id;
  }, [chat.id, lastMessageId]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
  }

  return (
    <div
      ref={listRef}
      className={styles.messageList}
      onScroll={handleScroll}
      role="log"
      tabIndex={0}
      aria-label="Сообщения в чате"
      aria-live="polite"
      aria-relevant="additions"
    >
      {chat.messages.length === 0 ? (
        <div className={styles.emptyConversation}>
          <span className={styles.conversationEmptyIcon} aria-hidden="true">
            <Icon name="message" size={30} />
          </span>
          <p>Начните разговор</p>
          <span>Напишите первое сообщение {chat.name}.</span>
        </div>
      ) : (
        <div className={styles.messageItems}>
          {chat.messages.map((message, index) => {
            const previousMessage = chat.messages[index - 1];
            const showDate =
              !previousMessage ||
              getDateKey(previousMessage.timestamp) !== getDateKey(message.timestamp);
            return (
              <Fragment key={message.id}>
                {showDate && (
                  <div className={styles.dateSeparator}>
                    <span>{formatMessageDate(message.timestamp)}</span>
                  </div>
                )}
                <MessageBubble message={message} canRetry={canRetry} onRetry={onRetry} />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
