import { useId, useLayoutEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Icon } from '@/shared/ui';
import { MAX_MESSAGE_LENGTH } from '@/shared/config';
import styles from './MessageComposer.module.css';

export interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isSending?: boolean;
  maxLength?: number;
}

export function MessageComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  isSending = false,
  maxLength = MAX_MESSAGE_LENGTH,
}: MessageComposerProps) {
  const fieldId = useId();
  const hintId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !isSending && value.trim().length > 0 && value.length <= maxLength;
  const showCharacterCount = value.length >= maxLength * 0.9;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [value]);

  function sendMessage() {
    if (!canSend) return;
    onSend();
    textareaRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit} aria-label="Отправка сообщения">
      <div className={styles.inputRow}>
        <label htmlFor={fieldId} className={styles.visuallyHidden}>
          Сообщение
        </label>
        <textarea
          ref={textareaRef}
          id={fieldId}
          className={styles.textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          rows={1}
          placeholder="Напишите сообщение…"
          aria-describedby={hintId}
          disabled={disabled}
        />
        <button
          className={styles.sendButton}
          type="submit"
          disabled={!canSend}
          aria-label={isSending ? 'Сообщение отправляется' : 'Отправить сообщение'}
          title={isSending ? 'Сообщение отправляется' : 'Отправить сообщение'}
          aria-busy={isSending}
        >
          {isSending ? (
            <span className={styles.pendingIndicator} />
          ) : (
            <Icon name="send" size={21} />
          )}
        </button>
      </div>
      <div className={styles.details} id={hintId}>
        <span className={styles.keyboardHint}>
          Enter — отправить · Shift + Enter — новая строка
        </span>
        {showCharacterCount && (
          <span className={styles.characterCount} aria-live="polite">
            {value.length} / {maxLength}
          </span>
        )}
      </div>
    </form>
  );
}
