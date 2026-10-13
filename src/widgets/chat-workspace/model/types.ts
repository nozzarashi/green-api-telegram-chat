import type { Conversation, ConversationMessageStatus } from '@/entities/chat';
import type { Messenger } from '@/shared/config';

export interface ChatWorkspaceProps {
  chats: Conversation[];
  activeChatId: string | null;
  connection: {
    status: 'connecting' | 'connected' | 'reconnecting' | 'error';
    message?: string;
  };
  instanceId: string;
  messenger?: Messenger;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onLogout: () => void;
  onDraftChange: (chatId: string, text: string) => void;
  onSend: (chatId: string) => void;
  onRetry: (chatId: string, messageId: string) => void;
}

export const connectionLabels: Record<ChatWorkspaceProps['connection']['status'], string> = {
  connecting: 'Подключение…',
  connected: 'На связи',
  reconnecting: 'Восстанавливаем соединение…',
  error: 'Нет соединения',
};

export const messageStatusLabels: Record<ConversationMessageStatus, string> = {
  queued: 'В очереди',
  sending: 'Отправляется',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не удалось отправить',
  unknown: 'Статус уточняется',
};
