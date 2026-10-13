import { useState } from 'react';
import { MessageComposer } from '@/features/send-message';
import { getMessengerConfig } from '@/shared/config';
import { Button, EmptyState, Icon } from '@/shared/ui';
import { connectionLabels } from '../model/types';
import type { ChatWorkspaceProps } from '../model/types';
import { ChatHeader } from './ChatHeader';
import { ChatSidebar } from './ChatSidebar';
import { MessageHistory } from './MessageHistory';
import styles from './ChatWorkspace.module.css';

export function ChatWorkspace({
  chats,
  activeChatId,
  connection,
  instanceId,
  messenger = 'max',
  onSelectChat,
  onNewChat,
  onLogout,
  onDraftChange,
  onSend,
  onRetry,
}: ChatWorkspaceProps) {
  const messengerConfig = getMessengerConfig(messenger);
  const [mobileListChatId, setMobileListChatId] = useState<string | null>(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const hasPendingMessage =
    activeChat?.messages.some((message) => message.status === 'sending') ?? false;
  const isMobileChatOpen = Boolean(activeChat && mobileListChatId !== activeChat.id);

  function selectChat(chatId: string) {
    setMobileListChatId(null);
    onSelectChat(chatId);
  }

  return (
    <section
      className={styles.workspace}
      data-chat-open={isMobileChatOpen}
      aria-label={`${messengerConfig.label} — сообщения`}
    >
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        connection={connection}
        instanceId={instanceId}
        messengerLabel={messengerConfig.label}
        onSelectChat={selectChat}
        onNewChat={onNewChat}
        onLogout={onLogout}
      />
      <section
        className={styles.conversation}
        aria-label={activeChat ? `Чат с ${activeChat.name}` : 'Область сообщений'}
      >
        {activeChat ? (
          <>
            <ChatHeader
              chat={activeChat}
              messengerLabel={messengerConfig.label}
              onBack={() => setMobileListChatId(activeChat.id)}
            />
            {connection.status !== 'connected' && (
              <div
                className={styles.connectionBanner}
                data-status={connection.status}
                role="status"
              >
                <Icon name={connection.status === 'error' ? 'warning' : 'refresh'} size={16} />
                <span>{connection.message || connectionLabels[connection.status]}</span>
              </div>
            )}
            <MessageHistory
              chat={activeChat}
              canRetry={connection.status === 'connected' && !hasPendingMessage}
              onRetry={(messageId) => onRetry(activeChat.id, messageId)}
            />
            <MessageComposer
              key={activeChat.id}
              value={activeChat.draft}
              onChange={(text) => onDraftChange(activeChat.id, text)}
              onSend={() => onSend(activeChat.id)}
              disabled={connection.status !== 'connected'}
              isSending={hasPendingMessage}
              maxLength={messengerConfig.maxMessageLength}
            />
          </>
        ) : (
          <div className={styles.startScreen}>
            <EmptyState
              title="Начните разговор"
              description="Выберите собеседника слева или создайте новый чат."
            >
              <Button onClick={onNewChat}>
                <Icon name="plus" size={18} /> Новый чат
              </Button>
            </EmptyState>
          </div>
        )}
      </section>
    </section>
  );
}
