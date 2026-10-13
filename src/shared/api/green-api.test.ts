import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, GreenApi } from './green-api';

const credentials = {
  apiUrl: 'https://4100.api.green-api.com/',
  idInstance: '4100000000',
  apiTokenInstance: 'private-test-token',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.useRealTimers());

describe('GREEN-API Telegram client', () => {
  it('resolves a phone number to the canonical Telegram chat ID with an integer payload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ exist: true, chatId: '12345' }));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await expect(api.checkAccount('+7 (999) 123-45-67')).resolves.toEqual({
      exists: true,
      chatId: '12345',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/checkAccount/private-test-token',
      expect.objectContaining({ method: 'POST', body: '{"phoneNumber":79991234567}' }),
    );
  });

  it('does not call the API for letters, short numbers or a leading zero', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = new GreenApi(credentials, { fetch: fetcher });
    for (const phoneNumber of ['number 79991234567', '123456', '0447911123456']) {
      await expect(api.checkAccount(phoneNumber)).rejects.toMatchObject({ code: 'validation' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a missing Telegram account without inventing a telephone chat ID', async () => {
    const api = new GreenApi(credentials, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ exist: false, chatId: '' })),
    });
    await expect(api.checkAccount('79991234567')).resolves.toEqual({ exists: false, chatId: '' });
  });

  it('handles the API business failure that may arrive with HTTP 200', async () => {
    const api = new GreenApi(credentials, {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ status: false, reason: 'not authorized' })),
    });
    await expect(api.checkAccount('79991234567')).rejects.toMatchObject({ code: 'account' });
  });

  it('sends a message using the server chat ID and returns the message ID', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ idMessage: 'message-1' }));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await expect(api.sendMessage('12345', 'Привет 😃')).resolves.toEqual({
      idMessage: 'message-1',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage/'),
      expect.objectContaining({ method: 'POST', body: '{"chatId":"12345","message":"Привет 😃"}' }),
    );
    await expect(api.sendMessage('12345', ' '.repeat(20))).rejects.toMatchObject({
      code: 'validation',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts both null and empty long-poll responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(new Response(''));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await expect(api.receiveNotification()).resolves.toBeNull();
    await expect(api.receiveNotification()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('?receiveTimeout=25'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('acknowledges with DELETE and receipt ID in the path, without a request body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ result: true, reason: '' }));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await api.deleteNotification(17);
    expect(fetcher).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/deleteNotification/private-test-token/17',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('does not expose credentials from service responses or network exceptions', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(`Rejected ${credentials.apiTokenInstance}`, { status: 401 }),
      )
      .mockRejectedValueOnce(new Error(`Failed request ${credentials.apiTokenInstance}`));
    const api = new GreenApi(credentials, { fetch: fetcher });
    const error: unknown = await api.getSettings().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'auth', isFatal: true, status: 401 });
    expect(String(error)).not.toContain(credentials.apiTokenInstance);
    await expect(api.getSettings()).rejects.toMatchObject({ code: 'network', isFatal: false });
  });

  it('rejects malformed successful responses and unsafe instance configuration', async () => {
    const api = new GreenApi(credentials, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>bad gateway</html>')),
    });
    await expect(api.getStateInstance()).rejects.toMatchObject({ code: 'response' });
    expect(() => new GreenApi({ ...credentials, apiUrl: 'http://api.green-api.com' })).toThrow(
      ApiError,
    );
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://user:password@api.green-api.com' }),
    ).toThrow(ApiError);
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://api.green-api.com.attacker.test' }),
    ).toThrow(ApiError);
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://attacker.test/api.green-api.com' }),
    ).toThrow(ApiError);
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://api.green-api.com/untrusted' }),
    ).toThrow(ApiError);
    expect(() => new GreenApi({ ...credentials, apiUrl: 'http://localhost:5173' })).toThrow(
      ApiError,
    );
    expect(() => new GreenApi({ ...credentials, apiUrl: 'https://api.green-api.com/v3' })).toThrow(
      ApiError,
    );
  });

  it('preserves caller cancellation as AbortError and cancels the actual fetch signal', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('abort', 'AbortError')),
        );
      });
    });
    const controller = new AbortController();
    const api = new GreenApi(credentials, { fetch: fetcher });
    const promise = api.receiveNotification(controller.signal);
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('times out stalled requests and releases the timeout after completion', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('abort', 'AbortError')),
          );
        }),
    );
    const api = new GreenApi(credentials, { fetch: fetcher, requestTimeoutMs: 50 });
    const assertion = expect(api.getSettings()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reads the Telegram instance type from the configured cluster without a version prefix', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        typeInstance: 'telegram',
        webhookUrl: '',
        incomingWebhook: 'yes',
        outgoingWebhook: 'yes',
        outgoingAPIMessageWebhook: 'yes',
        outgoingMessageWebhook: 'yes',
        stateWebhook: 'yes',
      }),
    );
    const api = new GreenApi({ ...credentials, messenger: 'telegram' }, { fetch: fetcher });
    expect(api.messenger).toBe('telegram');
    await expect(api.getSettings()).resolves.toMatchObject({
      typeInstance: 'telegram',
      incomingWebhook: 'yes',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/getSettings/private-test-token',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('resolves an international phone number using the canonical chat ID', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ exist: true, chatId: '123456789' }));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await expect(api.checkAccount('+44 7911 123456')).resolves.toEqual({
      exists: true,
      chatId: '123456789',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/checkAccount/'),
      expect.objectContaining({ body: '{"phoneNumber":447911123456}' }),
    );
  });

  it('preserves explicit international country codes beginning with 8', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ exist: true, chatId: '123456789' }));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await api.checkAccount('+81 3 1234 5678');
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/checkAccount/'),
      expect.objectContaining({ body: '{"phoneNumber":81312345678}' }),
    );
  });

  it('allows exactly 4096 Telegram characters and rejects 4097 without a request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ idMessage: 'telegram-message' }));
    const api = new GreenApi(credentials, { fetch: fetcher });
    await expect(api.sendMessage('12345', 'a'.repeat(4096))).resolves.toEqual({
      idMessage: 'telegram-message',
    });
    await expect(api.sendMessage('12345', 'a'.repeat(4097))).rejects.toMatchObject({
      code: 'validation',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not loosen HTTPS and host validation for Telegram', () => {
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://api.greenapi.com' }),
    ).not.toThrow();
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://api.greenapi.com.attacker.test' }),
    ).toThrow(ApiError);
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://attacker.test/api.greenapi.com' }),
    ).toThrow(ApiError);
    expect(() => new GreenApi({ ...credentials, apiUrl: 'http://4100.api.green-api.com' })).toThrow(
      ApiError,
    );
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://4100.api.green-api.com/v5' }),
    ).toThrow(ApiError);
    expect(
      () => new GreenApi({ ...credentials, apiUrl: 'https://4100.api.green-api.com/v3' }),
    ).toThrow(ApiError);
  });
});
