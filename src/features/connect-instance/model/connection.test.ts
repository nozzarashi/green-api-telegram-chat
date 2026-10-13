import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectConnection } from './connection';

const credentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '4100000000',
  apiTokenInstance: 'test-token',
};
const settings = {
  typeInstance: 'telegram',
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  stateWebhook: 'yes',
};
const response = (body: unknown) => new Response(JSON.stringify(body));

afterEach(() => vi.unstubAllGlobals());

describe('connection inspection', () => {
  it('reports missing authorization without waiting for or requesting settings', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ stateInstance: 'notAuthorized' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      inspectConnection(credentials, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'account' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toContain('/getStateInstance/');
  });

  it('requests settings only after the state request has confirmed authorization', async () => {
    let resolveState: ((result: Response) => void) | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveState = resolve;
          }),
      )
      .mockResolvedValueOnce(response(settings));
    vi.stubGlobal('fetch', fetcher);
    const connection = inspectConnection(credentials, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveState?.(response({ stateInstance: 'authorized' }));
    await expect(connection).resolves.toMatchObject({ settings: { typeInstance: 'telegram' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain('/getSettings/');
  });

  it('does not continue to settings when the server cannot be reached', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      inspectConnection(credentials, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'network' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
