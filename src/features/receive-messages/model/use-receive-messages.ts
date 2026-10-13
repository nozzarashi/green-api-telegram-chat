import { useEffect, useState } from 'react';
import type { ChatEvent } from '@/entities/chat';
import type { GreenApi, InstanceState } from '@/shared/api';
import { startNotificationPolling } from './poll-notifications';

export interface ChatConnection {
  status: 'connecting' | 'connected' | 'reconnecting' | 'error';
  message?: string;
}
const ACCOUNT_ERRORS: Record<Exclude<InstanceState, 'authorized'>, string> = {
  notAuthorized: 'Подключение отключено. Авторизуйте свой мессенджер в кабинете GREEN-API.',
  starting: 'Инстанс перезапускается. Дождитесь завершения запуска.',
  blocked: 'Аккаунт заблокирован. Проверьте его состояние в кабинете.',
  suspended: 'На аккаунте действуют ограничения отправки.',
  pendingPassword: 'Завершите вход в мессенджер в кабинете GREEN-API: требуется пароль.',
};
export function useReceiveMessages(
  api: GreenApi,
  onEvent: (event: ChatEvent) => void,
): ChatConnection {
  const [connection, setConnection] = useState<ChatConnection>({ status: 'connecting' });
  useEffect(() => {
    const controller = new AbortController();
    let unavailableState: Exclude<InstanceState, 'authorized'> | undefined;
    void startNotificationPolling({
      api,
      signal: controller.signal,
      onEvent: (event) => {
        if (controller.signal.aborted) return;
        if (event.type === 'account') {
          unavailableState = event.state === 'authorized' ? undefined : event.state;
          setConnection(
            unavailableState
              ? { status: 'error', message: ACCOUNT_ERRORS[unavailableState] }
              : { status: 'connected' },
          );
        }
        onEvent(event);
      },
      onConnectionChange: (status, message) => {
        if (!controller.signal.aborted && (!unavailableState || status === 'error'))
          setConnection({ status: status === 'checking' ? 'connecting' : status, message });
      },
    });
    return () => controller.abort();
  }, [api, onEvent]);
  return connection;
}
