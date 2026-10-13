import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/shared/api';
import type { GreenApi } from '@/shared/api';
import { Alert, Button, Icon, InputField } from '@/shared/ui';
import { hasChatNotifications, inspectConnection } from '../model/connection';
import type { ConnectedSession } from '../model/connection';
import styles from './ConnectInstanceForm.module.css';

export function ConnectInstanceForm({
  onConnect,
}: {
  onConnect: (session: ConnectedSession) => void;
}) {
  const [apiUrl, setApiUrl] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [setupApi, setSetupApi] = useState<GreenApi | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const invalidateSetup = () => {
    setSetupApi(null);
    setError('');
    setNotice('');
  };
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setError('');
    setNotice('');
    setSetupApi(null);
    try {
      const result = await inspectConnection(
        { apiUrl, idInstance: instanceId, apiTokenInstance: token },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!hasChatNotifications(result.settings)) {
        setSetupApi(result.api);
        setError(
          'В инстансе не настроен приём сообщений через HTTP. Включите уведомления о сообщениях, доставке и состоянии аккаунта.',
        );
        return;
      }
      onConnect({ api: result.api, instanceId: instanceId.trim() });
      setToken('');
    } catch (cause: unknown) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось подключиться. Попробуйте ещё раз.',
        );
    } finally {
      pendingRef.current = false;
      if (!controller.signal.aborted) {
        setPending(false);
      }
      controller.abort();
    }
  }
  async function prepare() {
    if (!setupApi || pendingRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      await setupApi.prepareNotifications(controller.signal);
      if (controller.signal.aborted) return;
      setSetupApi(null);
      setNotice(
        'Настройки сохранены. Инстанс перезапускается; это может занять до 5 минут. После этого нажмите «Подключиться».',
      );
    } catch (cause: unknown) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось сохранить настройки. Попробуйте ещё раз.',
        );
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="https://web.max.ru/" target="_blank" rel="noreferrer" className={styles.brand}>
          <span className={styles.logo}>M</span>
          <span>MAX</span>
        </a>
        <a
          href="https://green-api.com/v3/docs/before-start/"
          target="_blank"
          rel="noreferrer"
          className={styles.helpLink}
        >
          <Icon name="help" size={18} />
          Помощь
        </a>
      </header>
      <section className={styles.card} aria-labelledby="connect-heading">
        <div className={styles.cardLogo}>
          <Icon name="message" size={38} />
        </div>
        <h1 id="connect-heading">Ваш MAX. В браузере.</h1>
        <p className={styles.intro}>
          Подключите инстанс GREEN-API, чтобы отправлять и получать сообщения.
        </p>
        <form onSubmit={(event) => void connect(event)} className={styles.form}>
          <InputField
            label="apiUrl"
            type="url"
            placeholder="https://3100.api.green-api.com"
            helperText="Адрес API из кабинета вашего MAX-инстанса"
            value={apiUrl}
            required
            disabled={pending}
            autoComplete="off"
            onChange={(e) => {
              setApiUrl(e.target.value);
              invalidateSetup();
            }}
          />
          <InputField
            label="idInstance"
            placeholder="ID инстанса"
            value={instanceId}
            required
            pattern="[0-9]+"
            inputMode="numeric"
            disabled={pending}
            autoComplete="off"
            onChange={(e) => {
              setInstanceId(e.target.value);
              invalidateSetup();
            }}
          />
          <InputField
            label="apiTokenInstance"
            placeholder="Токен инстанса"
            type={showToken ? 'text' : 'password'}
            value={token}
            required
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setToken(e.target.value);
              invalidateSetup();
            }}
            suffix={
              <Button
                variant="ghost"
                aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
                aria-pressed={showToken}
                onClick={() => setShowToken(!showToken)}
              >
                <Icon name={showToken ? 'eyeOff' : 'eye'} />
              </Button>
            }
          />
          {error && <Alert>{error}</Alert>}
          {notice && <Alert tone="info">{notice}</Alert>}
          {setupApi && (
            <div className={styles.setup}>
              <p>
                Кнопка очистит Webhook URL и включит уведомления. Инстанс перезапустится, а
                получение событий по прежнему webhook прекратится.
              </p>
              <Button variant="secondary" disabled={pending} onClick={() => void prepare()}>
                Настроить приём сообщений
              </Button>
            </div>
          )}
          <Button type="submit" disabled={pending} className={styles.submit}>
            {pending ? 'Подключаемся…' : 'Подключиться'}
            {!pending && <Icon name="arrowRight" size={19} />}
          </Button>
        </form>
        <p className={styles.privacy}>Ключи хранятся только в памяти этой вкладки.</p>
      </section>
      <footer className={styles.footer}>
        Текстовые сообщения · GREEN-API для MAX
        <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">
          Кабинет GREEN-API <Icon name="arrowRight" size={15} />
        </a>
      </footer>
    </main>
  );
}
