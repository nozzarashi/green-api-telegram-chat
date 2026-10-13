import { ApiError, GreenApi } from '@/shared/api';
import type { InstanceSettings, InstanceState, SessionCredentials } from '@/shared/api';

export interface ConnectedSession {
  api: GreenApi;
  instanceId: string;
}
export function hasChatNotifications(settings: InstanceSettings): boolean {
  const requiredNotifications = [
    'incomingWebhook',
    'outgoingWebhook',
    'outgoingAPIMessageWebhook',
    'outgoingMessageWebhook',
    'stateWebhook',
  ] as const;
  return (
    settings.webhookUrl === '' && requiredNotifications.every((name) => settings[name] === 'yes')
  );
}
export function getStateDescription(state: InstanceState): string {
  const descriptions: Record<InstanceState, string> = {
    authorized: 'Инстанс подключён.',
    notAuthorized: 'Сначала подключите аккаунт MAX к инстансу в кабинете GREEN-API.',
    starting: 'Инстанс запускается. Подождите и попробуйте подключиться снова.',
    blocked: 'Аккаунт MAX заблокирован. Проверьте его состояние в кабинете GREEN-API.',
    suspended: 'Для аккаунта MAX действуют ограничения. Проверьте кабинет GREEN-API.',
    pendingPassword: 'Завершите вход в MAX в кабинете GREEN-API.',
  };
  return descriptions[state];
}
export async function inspectConnection(credentials: SessionCredentials, signal: AbortSignal) {
  const api = new GreenApi(credentials);
  const [state, settings] = await Promise.all([
    api.getStateInstance(signal),
    api.getSettings(signal),
  ]);
  if (settings.typeInstance !== 'v3')
    throw new ApiError('Нужен инстанс MAX. Выберите его в кабинете GREEN-API.', 'configuration');
  if (state.stateInstance !== 'authorized')
    throw new ApiError(getStateDescription(state.stateInstance), 'account');
  return { api, settings };
}
