import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/shared/api';
import type { GreenApi } from '@/shared/api';
import { normalizePhoneNumber, formatPhoneNumber, isValidPhoneNumber } from '@/shared/lib';
import { getMessengerConfig } from '@/shared/config';
import type { Messenger } from '@/shared/config';
import { Alert, Button, InputField, Modal } from '@/shared/ui';
import styles from './CreateChatForm.module.css';

export function CreateChatForm({
  api,
  messenger = 'max',
  onCreate,
  onClose,
}: {
  api: GreenApi;
  messenger?: Messenger;
  onCreate: (chat: { id: string; phone: string; name: string }) => void;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const profile = getMessengerConfig(messenger);
  useEffect(() => () => controllerRef.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const normalized = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(phone, messenger)) {
      setError(
        messenger === 'max'
          ? 'Введите номер РФ (+7) или Беларуси (+375) в международном формате.'
          : 'Введите телефон с кодом страны, например +49 151 12345678.',
      );
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      const result = await api.checkAccount(normalized, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.exists) {
        setError(
          `Аккаунт ${profile.label} не найден. Проверьте номер и доступность поиска по телефону.`,
        );
        return;
      }
      onCreate({ id: result.chatId, phone: normalized, name: formatPhoneNumber(normalized) });
    } catch (cause: unknown) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof ApiError ? cause.message : 'Не удалось создать чат. Попробуйте снова.',
        );
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }
  return (
    <Modal title="Новый чат" onClose={onClose}>
      <form className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.description}>
          Введите номер человека, которому хотите написать в {profile.label}.
        </p>
        <InputField
          label="Номер телефона"
          type="tel"
          placeholder="+7 999 123-45-67"
          helperText={profile.phoneHint}
          value={phone}
          autoComplete="tel"
          required
          disabled={pending}
          onChange={(e) => {
            setPhone(e.target.value);
            setError('');
          }}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Ищем аккаунт…' : 'Создать чат'}
        </Button>
      </form>
    </Modal>
  );
}
