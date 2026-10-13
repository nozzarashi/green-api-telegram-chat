import { parseNotification } from '../../../entities/chat';
import type { ChatEvent } from '../../../entities/chat';
import { ApiError } from '../../../shared/api';
import type { GreenApi } from '../../../shared/api';

const MIN_IDLE_POLL_INTERVAL_MS = 500;

export type PollConnectionState = 'checking' | 'connected' | 'reconnecting' | 'error';

export interface NotificationPollingOptions {
  api: Pick<GreenApi, 'receiveNotification' | 'deleteNotification'>;
  onEvent: (event: ChatEvent) => void | Promise<void>;
  onConnectionChange: (state: PollConnectionState, message?: string) => void;
  signal: AbortSignal;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = (): void => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** FIFO: receive → process → acknowledge. The caller owns and aborts the single loop. */
export async function startNotificationPolling({
  api,
  onEvent,
  onConnectionChange,
  signal,
}: NotificationPollingOptions): Promise<void> {
  let failures = 0;
  let lastState: PollConnectionState | undefined;
  let lastMessage: string | undefined;
  const connection = (state: PollConnectionState, message?: string): void => {
    if (lastState === state && lastMessage === message) return;
    lastState = state;
    lastMessage = message;
    onConnectionChange(state, message);
  };
  if (signal.aborted) return;
  connection('checking');
  while (!signal.aborted) {
    const iterationStartedAt = Date.now();
    try {
      const notification = await api.receiveNotification(signal);
      if (signal.aborted) return;
      connection('connected');
      if (notification !== null) {
        const event = parseNotification(notification.body);
        if (event !== null) await onEvent(event);
        if (signal.aborted) return;
        await api.deleteNotification(notification.receiptId, signal);
      } else {
        // A proxy may return an empty response immediately instead of holding a long poll.
        const elapsed = Math.max(0, Date.now() - iterationStartedAt);
        const remaining = MIN_IDLE_POLL_INTERVAL_MS - elapsed;
        if (remaining > 0) await delay(remaining, signal);
      }
      failures = 0;
    } catch (error: unknown) {
      if (signal.aborted) return;
      const message =
        error instanceof ApiError
          ? error.message
          : 'Не удалось обработать уведомление. Повторяем приём.';
      if (error instanceof ApiError && error.isFatal) {
        connection('error', message);
        return;
      }
      failures += 1;
      connection('reconnecting', message);
      await delay(Math.min(1000 * 2 ** Math.min(failures - 1, 4), 15_000), signal);
    }
  }
}
