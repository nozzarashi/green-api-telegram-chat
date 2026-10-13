import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api';
import type { NotificationEnvelope } from '../../../shared/api';
import { startNotificationPolling } from './poll-notifications';

const notification: NotificationEnvelope = {
  receiptId: 7,
  body: {
    typeWebhook: 'incomingMessageReceived',
    idMessage: 'message-1',
    timestamp: 100,
    senderData: { chatId: '12345' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
  },
};

afterEach(() => vi.useRealTimers());

describe('notification polling', () => {
  it('limits fast empty responses to two requests per second and aborts the idle delay', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockResolvedValue(null),
      deleteNotification: vi.fn(),
    };
    const onEvent = vi.fn();
    const polling = startNotificationPolling({
      api,
      signal: controller.signal,
      onEvent,
      onConnectionChange: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.receiveNotification).toHaveBeenCalledTimes(2);
    controller.abort();
    await polling;
    expect(onEvent).not.toHaveBeenCalled();
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([250, 25_000])(
    'counts the %i ms request duration toward the idle interval',
    async (duration) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const api = {
        receiveNotification: vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), duration);
              }),
          )
          .mockResolvedValue(null),
        deleteNotification: vi.fn(),
      };
      const polling = startNotificationPolling({
        api,
        signal: controller.signal,
        onEvent: vi.fn(),
        onConnectionChange: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(duration);
      const remaining = Math.max(0, 500 - duration);
      if (remaining > 0) {
        expect(api.receiveNotification).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(remaining - 1);
        expect(api.receiveNotification).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(api.receiveNotification).toHaveBeenCalledTimes(2);
      controller.abort();
      await polling;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('finishes processing and acknowledging before receiving the next notification', async () => {
    const order: string[] = [];
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn(async () => {
        order.push('receive');
        return notification;
      }),
      deleteNotification: vi.fn(async (receiptId: number) => {
        expect(receiptId).toBe(7);
        order.push('delete');
        controller.abort();
      }),
    };
    await startNotificationPolling({
      api,
      signal: controller.signal,
      onEvent: async () => {
        await Promise.resolve();
        order.push('process');
      },
      onConnectionChange: vi.fn(),
    });
    expect(order).toEqual(['receive', 'process', 'delete']);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
  });

  it('acknowledges unsupported events so they cannot block the FIFO queue', async () => {
    const controller = new AbortController();
    const onEvent = vi.fn();
    const api = {
      receiveNotification: vi.fn(async () => ({ receiptId: 8, body: { typeWebhook: 'unknown' } })),
      deleteNotification: vi.fn(async () => {
        controller.abort();
      }),
    };
    await startNotificationPolling({
      api,
      onEvent,
      signal: controller.signal,
      onConnectionChange: vi.fn(),
    });
    expect(onEvent).not.toHaveBeenCalled();
    expect(api.deleteNotification).toHaveBeenCalledWith(8, controller.signal);
  });

  it('retries network errors with backoff, recovers, and stops on cancellation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onConnectionChange = vi.fn();
    const api = {
      receiveNotification: vi
        .fn()
        .mockRejectedValueOnce(new ApiError('No connection', 'network'))
        .mockResolvedValueOnce(notification),
      deleteNotification: vi.fn(async () => {
        controller.abort();
      }),
    };
    const polling = startNotificationPolling({
      api,
      signal: controller.signal,
      onEvent: vi.fn(),
      onConnectionChange,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await polling;
    expect(api.receiveNotification).toHaveBeenCalledTimes(2);
    expect(onConnectionChange.mock.calls.map(([state]) => state)).toEqual([
      'checking',
      'reconnecting',
      'connected',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops immediately for invalid credentials without repeated auth requests', async () => {
    const onConnectionChange = vi.fn();
    const api = {
      receiveNotification: vi.fn().mockRejectedValue(new ApiError('Access denied', 'auth', 401)),
      deleteNotification: vi.fn(),
    };
    await startNotificationPolling({
      api,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      onConnectionChange,
    });
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(onConnectionChange).toHaveBeenLastCalledWith('error', 'Access denied');
  });

  it('does not acknowledge when processing failed, and cancels backoff promptly', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockResolvedValue(notification),
      deleteNotification: vi.fn(),
    };
    const polling = startNotificationPolling({
      api,
      signal: controller.signal,
      onEvent: () => {
        throw new Error('Failed to save message');
      },
      onConnectionChange: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await polling;
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
