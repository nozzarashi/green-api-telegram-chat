import { Icon } from '@/shared/ui';
import { formatMessageTime } from '../lib/format';
import { messageStatusLabels } from '../model/types';
import type { ConversationMessage, ConversationMessageStatus } from '@/entities/chat';
import styles from './ChatWorkspace.module.css';

function DeliveryStatus({ status }: { status: ConversationMessageStatus }) {
  return (
    <span
      className={`${styles.deliveryStatus} ${status === 'read' ? styles.readStatus : ''}`}
      title={messageStatusLabels[status]}
    >
      <span className={styles.visuallyHidden}>{messageStatusLabels[status]}</span>
      {status === 'sending' || status === 'queued' ? (
        <span className={styles.pendingStatus} aria-hidden="true" />
      ) : status === 'failed' || status === 'unknown' ? (
        <Icon name="warning" size={13} />
      ) : (
        <span className={styles.checks} aria-hidden="true">
          <Icon name="check" size={14} />
          {(status === 'delivered' || status === 'read') && <Icon name="check" size={14} />}
        </span>
      )}
    </span>
  );
}

interface MessageBubbleProps {
  message: ConversationMessage;
  canRetry: boolean;
  onRetry: (messageId: string) => void;
}

export function MessageBubble({ message, canRetry, onRetry }: MessageBubbleProps) {
  const isUnknown = message.status === 'unknown';
  const needsRetry = message.status === 'failed' || isUnknown;
  return (
    <div className={styles.messageRow} data-direction={message.direction}>
      <div className={styles.messageGroup}>
        <div
          className={styles.messageBubble}
          data-direction={message.direction}
          data-failed={message.status === 'failed'}
        >
          <p className={styles.messageText}>{message.text}</p>
          <span className={styles.messageMeta}>
            <time dateTime={new Date(message.timestamp).toISOString()}>
              {formatMessageTime(message.timestamp)}
            </time>
            {message.direction === 'outgoing' && <DeliveryStatus status={message.status} />}
          </span>
        </div>
        {needsRetry && (
          <div className={styles.messageFailure}>
            <span className={styles.failureDescription}>
              <span>{isUnknown ? 'Возможно, уже отправлено' : 'Не отправлено'}</span>
              {!isUnknown && message.error && (
                <span className={styles.failureReason}>{message.error}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              disabled={!canRetry}
              title={
                isUnknown
                  ? 'Повторная отправка может создать дубликат сообщения'
                  : 'Повторить отправку сообщения'
              }
            >
              <Icon name="refresh" size={13} /> {isUnknown ? 'Повторить отправку' : 'Повторить'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
