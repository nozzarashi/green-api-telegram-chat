import { ApiError, GreenApi } from '@/shared/api';
import type { InstanceSettings, InstanceState, SessionCredentials } from '@/shared/api';
import { getMessengerConfig } from '@/shared/config';
import type { Messenger } from '@/shared/config';

export interface ConnectedSession {
  api: GreenApi;
  instanceId: string;
  messenger: Messenger;
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
    notAuthorized:
      'Сначала подключите свой мессенджер на странице подключения в кабинете GREEN-API.',
    starting: 'Инстанс запускается. Подождите и попробуйте подключиться снова.',
    blocked: 'Аккаунт заблокирован. Проверьте его состояние в кабинете GREEN-API.',
    suspended: 'Для аккаунта действуют ограничения. Проверьте кабинет GREEN-API.',
    pendingPassword: 'Завершите вход в мессенджер на странице подключения в кабинете GREEN-API.',
  };
  return descriptions[state];
}
export async function inspectConnection(credentials: SessionCredentials, signal: AbortSignal) {
  const api = new GreenApi(credentials);
  const [state, settings] = await Promise.all([
    api.getStateInstance(signal),
    api.getSettings(signal),
  ]);
  const profile = getMessengerConfig(credentials.messenger ?? 'max');
  if (settings.typeInstance !== profile.instanceType)
    throw new ApiError(
      `Эти данные не относятся к ${profile.label}. Выберите нужный мессенджер или скопируйте данные другого подключения.`,
      'configuration',
    );
  if (state.stateInstance !== 'authorized')
    throw new ApiError(getStateDescription(state.stateInstance), 'account');
  return { api, settings };
}
