export interface SessionCredentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

const INSTANCE_STATES = [
  'authorized',
  'notAuthorized',
  'starting',
  'blocked',
  'suspended',
  'pendingPassword',
] as const;

export type InstanceState = (typeof INSTANCE_STATES)[number];

export function isInstanceState(value: unknown): value is InstanceState {
  return typeof value === 'string' && INSTANCE_STATES.some((state) => state === value);
}

export interface InstanceSettings {
  typeInstance: string;
  webhookUrl: string;
  incomingWebhook: 'yes' | 'no';
  outgoingWebhook: 'yes' | 'no';
  outgoingAPIMessageWebhook: 'yes' | 'no';
  outgoingMessageWebhook: 'yes' | 'no';
  stateWebhook: 'yes' | 'no';
  wid?: string;
}

export interface NotificationEnvelope {
  receiptId: number;
  body: unknown;
}

export interface CheckAccountResult {
  exists: boolean;
  chatId: string;
}

export interface SendMessageResult {
  idMessage: string;
}

export type ApiErrorCode =
  | 'auth'
  | 'account'
  | 'configuration'
  | 'validation'
  | 'network'
  | 'timeout'
  | 'server'
  | 'response';
