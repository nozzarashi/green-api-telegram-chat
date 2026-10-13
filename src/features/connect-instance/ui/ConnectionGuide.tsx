import { getMessengerConfig } from '@/shared/config';
import type { Messenger } from '@/shared/config';
import { Button, Icon } from '@/shared/ui';
import styles from './ConnectInstanceForm.module.css';

export function ConnectionGuide({
  messenger = 'telegram',
  detailed = false,
}: {
  messenger?: Messenger;
  detailed?: boolean;
}) {
  const profile = getMessengerConfig(messenger);
  return (
    <div className={styles.guideContent}>
      <p className={styles.guideIntro}>
        GREEN-API соединяет этот чат с вашим {profile.label}. Данные подключения выдаются в кабинете
        GREEN-API.
      </p>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          <div>
            <strong>Откройте кабинет GREEN-API</strong>
            <p>Зарегистрируйтесь по почте. Если аккаунт уже есть, войдите.</p>
          </div>
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          <div>
            <strong>Создайте подключение {profile.label}</strong>
            <p>
              Выберите бесплатный тариф Developer и подключите Telegram по инструкции на странице.
            </p>
          </div>
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          <div>
            <strong>Скопируйте три значения</strong>
            <p>Адрес API, ID подключения и ключ доступа — в поля этого чата.</p>
          </div>
        </li>
      </ol>
      {detailed && (
        <div className={styles.guideDetails}>
          <p>
            В кабинете подключение называется «инстансом». После входа в Telegram его состояние
            должно быть «Авторизован».
          </p>
          <p>
            Для проверки ответа напишите человеку, который согласен получить тестовое сообщение. Ему
            нужен только {profile.label}; аккаунт GREEN-API ему не требуется.
          </p>
        </div>
      )}
      <Button asChild variant="secondary" className={styles.consoleLink}>
        <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">
          Открыть GREEN-API <Icon name="external" size={16} />
        </a>
      </Button>
      {detailed && (
        <a className={styles.docsLink} href={profile.docsUrl} target="_blank" rel="noreferrer">
          Официальная инструкция <Icon name="arrowRight" size={16} />
        </a>
      )}
    </div>
  );
}
