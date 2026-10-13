import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/api';
import type { ApiErrorCode, GreenApi, SessionCredentials } from '@/shared/api';
import { hasChatNotifications, inspectConnection } from './connection';
import type { ConnectedSession } from './connection';

export function useInstanceConnection(onConnect: (session: ConnectedSession) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ApiErrorCode>();
  const [notice, setNotice] = useState('');
  const [setupApi, setSetupApi] = useState<GreenApi | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => () => controllerRef.current?.abort(), []);

  function clearFeedback() {
    setSetupApi(null);
    setError('');
    setErrorCode(undefined);
    setNotice('');
  }
  function beginRequest() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setError('');
    setErrorCode(undefined);
    setNotice('');
    return controller;
  }
  function finishRequest(controller: AbortController) {
    pendingRef.current = false;
    if (!controller.signal.aborted) setPending(false);
    controller.abort();
  }
  function reportFailure(cause: unknown, fallback: string) {
    setError(cause instanceof ApiError ? cause.message : fallback);
    setErrorCode(cause instanceof ApiError ? cause.code : undefined);
  }
  async function connect(credentials: SessionCredentials) {
    if (pendingRef.current) return;
    const controller = beginRequest();
    setSetupApi(null);
    try {
      const result = await inspectConnection(credentials, controller.signal);
      if (controller.signal.aborted) return;
      if (!hasChatNotifications(result.settings)) {
        setSetupApi(result.api);
        setError(
          'В инстансе не настроен приём сообщений через HTTP. Включите уведомления о сообщениях, доставке и состоянии аккаунта.',
        );
        return;
      }
      onConnect({
        api: result.api,
        instanceId: credentials.idInstance.trim(),
        messenger: credentials.messenger ?? 'telegram',
      });
    } catch (cause: unknown) {
      if (!controller.signal.aborted)
        reportFailure(cause, 'Подключение не удалось. Попробуйте ещё раз.');
    } finally {
      finishRequest(controller);
    }
  }
  async function prepare() {
    if (!setupApi || pendingRef.current) return;
    const controller = beginRequest();
    try {
      await setupApi.prepareNotifications(controller.signal);
      if (controller.signal.aborted) return;
      setSetupApi(null);
      setNotice(
        'Настройки сохранены. Подключение перезапускается; это может занять до 5 минут. После этого нажмите кнопку подключения ещё раз.',
      );
    } catch (cause: unknown) {
      if (!controller.signal.aborted)
        reportFailure(cause, 'Не удалось сохранить настройки. Попробуйте ещё раз.');
    } finally {
      finishRequest(controller);
    }
  }
  const serviceUnavailable =
    errorCode === 'network' || errorCode === 'timeout' || errorCode === 'server';
  return {
    pending,
    error,
    notice,
    serviceUnavailable,
    needsSetup: Boolean(setupApi),
    clearFeedback,
    connect,
    prepare,
  };
}
