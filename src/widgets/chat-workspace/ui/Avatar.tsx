import type { Conversation } from '@/entities/chat';
import { getInitials } from '../lib/format';
import styles from './ChatWorkspace.module.css';

const avatarColors = [
  styles.avatarViolet,
  styles.avatarBlue,
  styles.avatarGreen,
  styles.avatarRose,
];

export function Avatar({
  chat,
  className = '',
}: {
  chat: Pick<Conversation, 'id' | 'name'>;
  className?: string;
}) {
  const hash = Array.from(chat.id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return (
    <span
      className={`${styles.avatar} ${avatarColors[hash % avatarColors.length]} ${className}`}
      aria-hidden="true"
    >
      {getInitials(chat.name)}
    </span>
  );
}
