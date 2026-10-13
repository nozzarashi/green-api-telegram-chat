import { Icon } from '@/shared/ui';
import type { Conversation } from '@/entities/chat';
import { Avatar } from './Avatar';
import styles from './ChatWorkspace.module.css';

export function ChatHeader({
  chat,
  messengerLabel,
  onBack,
}: {
  chat: Conversation;
  messengerLabel: string;
  onBack: () => void;
}) {
  return (
    <header className={styles.conversationHeader}>
      <button
        className={`${styles.iconButton} ${styles.backButton}`}
        type="button"
        onClick={onBack}
        aria-label="Вернуться к списку чатов"
      >
        <Icon name="back" size={22} />
      </button>
      <Avatar chat={chat} className={styles.headerAvatar} />
      <div className={styles.contactInfo}>
        <h1 className={styles.contactName}>{chat.name}</h1>
        <span className={styles.contactDetails}>
          {chat.phone && chat.phone !== chat.name ? chat.phone : messengerLabel}
        </span>
      </div>
    </header>
  );
}
