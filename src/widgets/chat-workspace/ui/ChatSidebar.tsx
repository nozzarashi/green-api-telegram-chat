import { useMemo, useState } from 'react';
import { Button, Icon } from '@/shared/ui';
import { formatChatTime } from '../lib/format';
import { connectionLabels } from '../model/types';
import type { ChatWorkspaceProps } from '../model/types';
import { Avatar } from './Avatar';
import styles from './ChatWorkspace.module.css';

type ChatSidebarProps = Pick<
  ChatWorkspaceProps,
  'chats' | 'activeChatId' | 'connection' | 'instanceId' | 'onSelectChat' | 'onNewChat' | 'onLogout'
>;

export function ChatSidebar({
  chats,
  activeChatId,
  connection,
  instanceId,
  onSelectChat,
  onNewChat,
  onLogout,
}: ChatSidebarProps) {
  const [query, setQuery] = useState('');
  const visibleChats = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
    const phoneQuery = normalizedQuery.replace(/[\s()-]/g, '');
    return chats
      .filter(
        (chat) =>
          !normalizedQuery ||
          chat.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery) ||
          Boolean(phoneQuery && chat.phone?.replace(/[\s()-]/g, '').includes(phoneQuery)),
      )
      .sort(
        (first, second) =>
          (second.messages.at(-1)?.timestamp ?? 0) - (first.messages.at(-1)?.timestamp ?? 0),
      );
  }, [chats, query]);

  return (
    <aside className={styles.sidebar} aria-label="Список чатов">
      <header className={styles.sidebarHeader}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Icon name="message" size={23} />
          </span>
          <div>
            <span className={styles.brandName}>MAX</span>
            <span className={styles.brandSubtitle}>Сообщения</span>
          </div>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onNewChat}
          title="Новый чат"
          aria-label="Новый чат"
        >
          <Icon name="plus" size={22} />
        </button>
      </header>

      <div className={styles.searchContainer}>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <span className={styles.visuallyHidden}>Поиск по имени или телефону</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по чатам"
            aria-label="Поиск по имени или телефону"
          />
        </label>
      </div>

      <div className={styles.chatList}>
        {visibleChats.length > 0 ? (
          <ul className={styles.chatListItems}>
            {visibleChats.map((chat) => {
              const lastMessage = chat.messages.at(-1);
              const hasDraft = chat.draft.trim().length > 0;
              const preview = hasDraft ? chat.draft : (lastMessage?.text ?? 'Начните переписку');
              return (
                <li key={chat.id}>
                  <button
                    className={`${styles.chatItem} ${chat.id === activeChatId ? styles.activeChat : ''}`}
                    type="button"
                    onClick={() => onSelectChat(chat.id)}
                    aria-pressed={chat.id === activeChatId}
                    aria-label={`${chat.name}${chat.unreadCount > 0 ? `, непрочитанных: ${chat.unreadCount}` : ''}`}
                  >
                    <Avatar chat={chat} />
                    <span className={styles.chatItemContent}>
                      <span className={styles.chatItemTop}>
                        <span className={styles.chatName}>{chat.name}</span>
                        {lastMessage && (
                          <time className={styles.chatTime}>
                            {formatChatTime(lastMessage.timestamp)}
                          </time>
                        )}
                      </span>
                      <span className={styles.chatItemBottom}>
                        <span className={styles.chatPreview}>
                          {hasDraft ? (
                            <span className={styles.draftLabel}>Черновик: </span>
                          ) : lastMessage?.direction === 'outgoing' ? (
                            'Вы: '
                          ) : (
                            ''
                          )}
                          {preview}
                        </span>
                        {chat.unreadCount > 0 && (
                          <span className={styles.unreadBadge}>
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.emptyList} role="status">
            <span className={styles.emptyListIcon} aria-hidden="true">
              <Icon name={query ? 'search' : 'message'} size={26} />
            </span>
            <p>{query ? 'Чаты не найдены' : 'Пока нет чатов'}</p>
            <span>
              {query ? 'Попробуйте другое имя или номер.' : 'Начните разговор — он появится здесь.'}
            </span>
            {!query && (
              <Button variant="secondary" onClick={onNewChat}>
                Новый чат
              </Button>
            )}
          </div>
        )}
      </div>

      <footer className={styles.sidebarFooter}>
        <div className={styles.accountInfo}>
          <span className={styles.connectionLabel} data-status={connection.status}>
            <span className={styles.connectionDot} aria-hidden="true" />
            {connectionLabels[connection.status]}
          </span>
          <span className={styles.instanceLabel} title={`Аккаунт ${instanceId}`}>
            Аккаунт {instanceId}
          </span>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onLogout}
          aria-label="Выйти из аккаунта"
          title="Выйти из аккаунта"
        >
          <Icon name="logout" size={20} />
        </button>
      </footer>
    </aside>
  );
}
