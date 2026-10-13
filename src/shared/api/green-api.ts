import type {
  ApiErrorCode,
  CheckAccountResult,
  InstanceSettings,
  InstanceState,
  NotificationEnvelope,
  SendMessageResult,
  SessionCredentials,
} from './types';
import { getMessengerConfig } from '@/shared/config';
import type { Messenger, MessengerConfig } from '@/shared/config';
import { isValidPhoneNumber, normalizePhoneNumber } from '@/shared/lib';
import { isInstanceState } from './types';

const DEFAULT_TIMEOUT_MS = 30_000;
const RECEIVE_TIMEOUT_SECONDS = 25;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | undefined;
  readonly isFatal: boolean;

  constructor(message: string, code: ApiErrorCode, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.isFatal = code === 'auth' || code === 'configuration';
  }
}

export interface GreenApiOptions {
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): ApiError {
  return new ApiError('GREEN-API вернул неожиданный ответ. Попробуйте ещё раз.', 'response');
}

function abortError(): DOMException {
  return new DOMException('Запрос отменён.', 'AbortError');
}

/** Direct HTTPS client for MAX and Telegram. Credentials never appear in error messages. */
export class GreenApi {
  readonly messenger: Messenger;
  private readonly profile: MessengerConfig;
  private readonly credentials: SessionCredentials;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(credentials: SessionCredentials, options: GreenApiOptions = {}) {
    this.messenger = credentials.messenger ?? 'max';
    if (this.messenger !== 'max' && this.messenger !== 'telegram') {
      throw new ApiError('Выберите MAX или Telegram для подключения.', 'configuration');
    }
    this.profile = getMessengerConfig(this.messenger);
    let apiUrl: URL;
    try {
      apiUrl = new URL(credentials.apiUrl.trim());
    } catch {
      throw new ApiError('Укажите корректный адрес API из кабинета GREEN-API.', 'configuration');
    }
    const officialHost = ['api.green-api.com', 'api.greenapi.com'].some(
      (host) => apiUrl.hostname === host || apiUrl.hostname.endsWith(`.${host}`),
    );
    const allowedPaths = this.messenger === 'max' ? ['/', '/v3', '/v3/'] : ['/'];
    if (
      apiUrl.protocol !== 'https:' ||
      !officialHost ||
      (apiUrl.port && apiUrl.port !== '443') ||
      !allowedPaths.includes(apiUrl.pathname) ||
      apiUrl.username ||
      apiUrl.password ||
      apiUrl.search ||
      apiUrl.hash
    ) {
      throw new ApiError(
        'Укажите HTTPS-адрес API из кабинета GREEN-API, например https://3100.api.green-api.com.',
        'configuration',
      );
    }
    if (!/^\d+$/.test(credentials.idInstance.trim()) || !credentials.apiTokenInstance.trim()) {
      throw new ApiError('Проверьте ID инстанса и API-токен.', 'configuration');
    }
    this.credentials = {
      apiUrl: apiUrl.href.replace(/\/+$/, ''),
      idInstance: credentials.idInstance.trim(),
      apiTokenInstance: credentials.apiTokenInstance.trim(),
      messenger: this.messenger,
    };
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getStateInstance(signal?: AbortSignal): Promise<{ stateInstance: InstanceState }> {
    const result = await this.request('getStateInstance', 'GET', undefined, signal);
    if (!isRecord(result) || !isInstanceState(result.stateInstance)) throw invalidResponse();
    return { stateInstance: result.stateInstance };
  }

  async getSettings(signal?: AbortSignal): Promise<InstanceSettings> {
    const result = await this.request('getSettings', 'GET', undefined, signal);
    if (
      !isRecord(result) ||
      typeof result.typeInstance !== 'string' ||
      typeof result.webhookUrl !== 'string'
    )
      throw invalidResponse();
    const setting = (name: string): 'yes' | 'no' => (result[name] === 'yes' ? 'yes' : 'no');
    return {
      typeInstance: result.typeInstance,
      webhookUrl: result.webhookUrl,
      incomingWebhook: setting('incomingWebhook'),
      outgoingWebhook: setting('outgoingWebhook'),
      outgoingAPIMessageWebhook: setting('outgoingAPIMessageWebhook'),
      outgoingMessageWebhook: setting('outgoingMessageWebhook'),
      stateWebhook: setting('stateWebhook'),
      ...(typeof result.wid === 'string' ? { wid: result.wid } : {}),
    };
  }

  async checkAccount(phoneNumber: string, signal?: AbortSignal): Promise<CheckAccountResult> {
    if (!isValidPhoneNumber(phoneNumber, this.messenger)) {
      throw new ApiError(
        `Введите корректный номер телефона. ${this.profile.phoneHint}.`,
        'validation',
      );
    }
    const digits = normalizePhoneNumber(phoneNumber);
    const result = await this.request(
      'checkAccount',
      'POST',
      { phoneNumber: Number(digits) },
      signal,
    );
    if (!isRecord(result)) throw invalidResponse();
    if (result.status === false) {
      throw new ApiError(
        'Не удалось проверить номер. Убедитесь, что инстанс авторизован и лимит проверок не исчерпан.',
        'account',
      );
    }
    if (
      typeof result.exist !== 'boolean' ||
      typeof result.chatId !== 'string' ||
      (result.exist && !/^\d+$/.test(result.chatId))
    )
      throw invalidResponse();
    return { exists: result.exist, chatId: result.chatId };
  }

  async sendMessage(
    chatId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    if (!/^-?\d+$/.test(chatId)) {
      throw new ApiError(
        'Не удалось определить чат получателя. Создайте чат заново.',
        'validation',
      );
    }
    if (!message.trim() || message.length > this.profile.maxMessageLength) {
      throw new ApiError(
        `Сообщение должно содержать от 1 до ${this.profile.maxMessageLength} символов.`,
        'validation',
      );
    }
    const result = await this.request('sendMessage', 'POST', { chatId, message }, signal);
    if (!isRecord(result) || typeof result.idMessage !== 'string' || !result.idMessage)
      throw invalidResponse();
    return { idMessage: result.idMessage };
  }

  async receiveNotification(signal?: AbortSignal): Promise<NotificationEnvelope | null> {
    const result = await this.request(
      'receiveNotification',
      'GET',
      undefined,
      signal,
      `?receiveTimeout=${RECEIVE_TIMEOUT_SECONDS}`,
    );
    if (result === null) return null;
    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.receiptId) ||
      typeof result.receiptId !== 'number' ||
      result.receiptId < 0 ||
      !('body' in result)
    )
      throw invalidResponse();
    return { receiptId: result.receiptId, body: result.body };
  }

  async deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void> {
    if (!Number.isSafeInteger(receiptId) || receiptId < 0) throw invalidResponse();
    const result = await this.request(
      'deleteNotification',
      'DELETE',
      undefined,
      signal,
      `/${receiptId}`,
    );
    if (!isRecord(result) || result.result !== true) {
      throw new ApiError('Не удалось подтвердить уведомление. Приём будет повторён.', 'response');
    }
  }

  async prepareNotifications(signal?: AbortSignal): Promise<void> {
    const result = await this.request(
      'setSettings',
      'POST',
      {
        webhookUrl: '',
        incomingWebhook: 'yes',
        outgoingWebhook: 'yes',
        outgoingAPIMessageWebhook: 'yes',
        outgoingMessageWebhook: 'yes',
        stateWebhook: 'yes',
      },
      signal,
    );
    if (!isRecord(result) || result.saveSettings !== true) throw invalidResponse();
  }

  private async request(
    method: string,
    verb: 'GET' | 'POST' | 'DELETE',
    body?: Record<string, unknown>,
    signal?: AbortSignal,
    suffix = '',
  ): Promise<unknown> {
    if (signal?.aborted) throw abortError();
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    const url = `${apiUrl}/waInstance${idInstance}/${method}/${encodeURIComponent(apiTokenInstance)}${suffix}`;
    try {
      const response = await this.fetcher(url, {
        method: verb,
        signal: controller.signal,
        cache: 'no-store',
        ...(body
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
      const raw = await response.text();
      if (!response.ok) throw this.httpError(response.status, raw);
      if (!raw.trim()) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed;
      } catch {
        throw invalidResponse();
      }
    } catch (error: unknown) {
      if (signal?.aborted) throw abortError();
      if (error instanceof ApiError) throw error;
      if (timedOut)
        throw new ApiError('GREEN-API не ответил вовремя. Повторяем подключение.', 'timeout');
      throw new ApiError(
        'Нет связи с GREEN-API. Проверьте интернет и адрес API из кабинета.',
        'network',
      );
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private httpError(status: number, raw: string): ApiError {
    // Only known classifications are exposed; raw service responses may contain credentials.
    if (status === 401 || (status === 403 && !/suspend|block/i.test(raw))) {
      return new ApiError('Доступ отклонён. Проверьте ID инстанса и API-токен.', 'auth', status);
    }
    if (status === 403)
      return new ApiError('На аккаунте мессенджера действуют ограничения.', 'account', status);
    if (status === 429 || status === 469)
      return new ApiError(
        'Достигнут лимит запросов. Подождите и повторите попытку.',
        'server',
        status,
      );
    if (status === 400 && /webhook\s?url|webhookUrl/i.test(raw)) {
      return new ApiError(
        'Приём HTTP отключён: очистите Webhook URL в настройках инстанса и подождите минуту.',
        'configuration',
        status,
      );
    }
    if (status >= 500)
      return new ApiError(
        'GREEN-API временно недоступен. Повторяем подключение.',
        'server',
        status,
      );
    if (status === 400)
      return new ApiError(
        'GREEN-API отклонил запрос. Проверьте введённые данные.',
        'validation',
        status,
      );
    return new ApiError(
      `Не удалось выполнить запрос к GREEN-API (код ${status}).`,
      'server',
      status,
    );
  }
}
