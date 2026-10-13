import { useState } from 'react';
import type { FormEvent } from 'react';
import { getMessengerConfig } from '@/shared/config';
import { Alert, Button, Icon, InputField, Modal } from '@/shared/ui';
import type { ConnectedSession } from '../model/connection';
import { useInstanceConnection } from '../model/use-instance-connection';
import { ConnectionGuide } from './ConnectionGuide';
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
  const [showGuide, setShowGuide] = useState(false);
  const profile = getMessengerConfig();
  const connection = useInstanceConnection(onConnect);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void connection.connect({
      messenger: 'telegram',
      apiUrl,
      idInstance: instanceId,
      apiTokenInstance: token,
    });
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandName}>Чат</span>
          <span className={styles.brandDivider} />
          <span className={styles.brandDescription}>Telegram</span>
        </div>
        <a className={styles.headerLink} href={profile.docsUrl} target="_blank" rel="noreferrer">
          Документация <Icon name="external" size={15} />
        </a>
      </header>
      <section className={styles.content} aria-labelledby="connect-heading">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Через GREEN-API</p>
          <h1 id="connect-heading">Подключите Telegram</h1>
          <p>Отправляйте сообщения и читайте ответы в одном окне.</p>
        </div>
        <div className={styles.panels}>
          <div className={styles.formPanel}>
            <div className={styles.panelHeading}>
              <h2>Данные подключения</h2>
            </div>
            <form onSubmit={submit} className={styles.form} aria-busy={connection.pending}>
              <InputField
                label="Адрес API"
                type="url"
                placeholder="https://7105.api.greenapi.com"
                helperText="В кабинете — apiUrl"
                value={apiUrl}
                required
                disabled={connection.pending}
                autoComplete="off"
                onChange={(event) => {
                  setApiUrl(event.target.value);
                  connection.clearFeedback();
                }}
              />
              <InputField
                label="ID подключения"
                placeholder="Скопируйте ID из кабинета"
                helperText="В кабинете — idInstance"
                value={instanceId}
                required
                pattern="[0-9]+"
                inputMode="numeric"
                disabled={connection.pending}
                autoComplete="off"
                onChange={(event) => {
                  setInstanceId(event.target.value);
                  connection.clearFeedback();
                }}
              />
              <InputField
                label="Ключ доступа"
                placeholder="Вставьте ключ"
                helperText="В кабинете — apiTokenInstance"
                type={showToken ? 'text' : 'password'}
                value={token}
                required
                disabled={connection.pending}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setToken(event.target.value);
                  connection.clearFeedback();
                }}
                suffix={
                  <Button
                    variant="ghost"
                    aria-label={showToken ? 'Скрыть ключ' : 'Показать ключ'}
                    aria-pressed={showToken}
                    onClick={() => setShowToken(!showToken)}
                  >
                    <Icon name={showToken ? 'eyeOff' : 'eye'} size={18} />
                  </Button>
                }
              />
              {connection.error && (
                <Alert>
                  {connection.error}
                  {connection.serviceUnavailable && (
                    <a
                      className={styles.serviceStatusLink}
                      href="https://status.green-api.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Проверить статус GREEN-API <Icon name="external" size={15} />
                    </a>
                  )}
                </Alert>
              )}
              {connection.notice && <Alert tone="info">{connection.notice}</Alert>}
              {connection.needsSetup && (
                <div className={styles.setup}>
                  <p>
                    Настройка включит приём сообщений и очистит прежний Webhook URL. Существующее
                    получение событий по webhook прекратится.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={connection.pending}
                    onClick={() => void connection.prepare()}
                  >
                    Настроить приём сообщений
                  </Button>
                </div>
              )}
              <Button type="submit" disabled={connection.pending} className={styles.submit}>
                {connection.pending ? 'Подключаемся…' : `Подключить ${profile.label}`}
                {!connection.pending && <Icon name="arrowRight" size={18} />}
              </Button>
              <p className={styles.privacy}>
                <Icon name="shield" size={16} />
                <span>Ключ хранится в этой вкладке и удаляется при выходе.</span>
              </p>
            </form>
          </div>
          <aside className={styles.guidePanel} aria-label="Получение данных подключения">
            <div className={styles.guideHeading}>
              <h2>Первое подключение?</h2>
              <p>Нужен бесплатный кабинет GREEN-API.</p>
            </div>
            <ConnectionGuide />
            <Button
              variant="ghost"
              onClick={() => setShowGuide(true)}
              className={styles.guideButton}
            >
              <Icon name="help" size={18} />
              Как получить данные
            </Button>
          </aside>
        </div>
      </section>
      <footer className={styles.footer}>
        <span>Telegram-чат · GREEN-API</span>
        <span>Данные подключения вводите из своего кабинета</span>
      </footer>
      {showGuide && (
        <Modal title={`Как подключить ${profile.label}`} onClose={() => setShowGuide(false)}>
          <ConnectionGuide detailed />
        </Modal>
      )}
    </main>
  );
}
