import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const API_URL = 'https://4100.api.green-api.com';
const INSTANCE_ID = '4100220001';
const TOKEN = 'telegram_test_token_not_a_real_secret';
const CHAT_ID = '10000000';
const PHONE = 79991234567;

interface Notification {
  receiptId: number;
  body: Record<string, unknown>;
}

interface ApiCall {
  method: string;
  verb: string;
  url: string;
  body: unknown;
}

interface MockOptions {
  apiUrl?: string;
  idInstance?: string;
  instanceType?: string;
  settings?: Record<string, unknown>;
  stateStatus?: number;
  state?: string;
  holdState?: boolean;
  stateAbortCount?: number;
  sendFailures?: number;
  sendErrorStatus?: number;
  sendDelay?: number;
  deleteFailures?: number;
  receiveStatus?: number;
  holdReceive?: boolean;
  accountExists?: boolean;
  onSend?: () => void;
}

function textNotification(
  receiptId: number,
  idMessage: string,
  text: string,
  type = 'incomingMessageReceived',
  extended = false,
): Notification {
  return {
    receiptId,
    body: {
      typeWebhook: type,
      timestamp: Math.floor(Date.now() / 1000),
      idMessage,
      instanceData: { idInstance: Number(INSTANCE_ID), typeInstance: 'telegram' },
      senderData: {
        chatId: CHAT_ID,
        chatType: 'user',
        sender: CHAT_ID,
        senderName: 'Собеседник',
        senderPhoneNumber: PHONE,
      },
      messageData: extended
        ? { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text } }
        : { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
    },
  };
}

function statusNotification(receiptId: number, idMessage: string, status: string): Notification {
  return {
    receiptId,
    body: {
      typeWebhook: 'outgoingMessageStatus',
      timestamp: Math.floor(Date.now() / 1000),
      idMessage,
      chatId: CHAT_ID,
      status,
    },
  };
}

async function installApiMock(page: Page, options: MockOptions = {}) {
  const apiUrl = options.apiUrl ?? API_URL;
  const idInstance = options.idInstance ?? INSTANCE_ID;
  const calls: ApiCall[] = [];
  const queue: Notification[] = [];
  let sendFailures = options.sendFailures ?? 0;
  let deleteFailures = options.deleteFailures ?? 0;
  let activeReceives = 0;
  let maxActiveReceives = 0;
  let receiveHeld = options.holdReceive ?? false;
  const waitingReceives: Array<() => void> = [];
  let stateHeld = options.holdState ?? false;
  let stateAbortCount = options.stateAbortCount ?? 0;
  const waitingStates: Array<() => void> = [];
  const settings = {
    typeInstance: options.instanceType ?? 'telegram',
    webhookUrl: '',
    incomingWebhook: 'yes',
    outgoingWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    stateWebhook: 'yes',
    ...options.settings,
  };

  const respond = async (route: Route, body: unknown, status = 200) => {
    try {
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    } catch {
      // An aborted receive or closed test context can invalidate a delayed route.
    }
  };

  await page.route(`${apiUrl}/waInstance${idInstance}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/');
    const method = parts[2] ?? '';
    let body: unknown = null;
    if (request.postData()) body = request.postDataJSON();
    calls.push({ method, verb: request.method(), url: request.url(), body });

    if (method === 'getStateInstance') {
      if (stateAbortCount > 0) {
        stateAbortCount -= 1;
        await route.abort('connectionfailed');
        return;
      }
      if (stateHeld) await new Promise<void>((resolve) => waitingStates.push(resolve));
      await respond(route, { stateInstance: options.state ?? 'authorized' }, options.stateStatus);
    } else if (method === 'getSettings') {
      await respond(route, settings);
    } else if (method === 'checkAccount') {
      await respond(route, { exist: options.accountExists ?? true, chatId: CHAT_ID });
    } else if (method === 'sendMessage') {
      options.onSend?.();
      if (options.sendDelay) await new Promise((resolve) => setTimeout(resolve, options.sendDelay));
      if (sendFailures > 0) {
        sendFailures -= 1;
        await respond(route, { error: 'Mock send error' }, options.sendErrorStatus ?? 400);
      } else {
        await respond(route, { idMessage: 'outgoing-1' });
      }
    } else if (method === 'receiveNotification') {
      activeReceives += 1;
      maxActiveReceives = Math.max(maxActiveReceives, activeReceives);
      try {
        if (receiveHeld) await new Promise<void>((resolve) => waitingReceives.push(resolve));
        // A real receive waits server-side. The delay keeps a null mock from flooding the loop.
        await new Promise((resolve) => setTimeout(resolve, 120));
        await respond(route, queue[0] ?? null, options.receiveStatus);
      } finally {
        activeReceives -= 1;
      }
    } else if (method === 'deleteNotification') {
      if (deleteFailures > 0) {
        deleteFailures -= 1;
        await respond(route, { error: 'Temporary acknowledge error' }, 500);
      } else {
        const receiptId = Number(parts[4]);
        if (queue[0]?.receiptId === receiptId) queue.shift();
        await respond(route, { result: true, reason: '' });
      }
    } else if (method === 'setSettings') {
      Object.assign(settings, body);
      await respond(route, { saveSettings: true });
    } else {
      await respond(route, { error: `Unmocked method: ${method}` }, 404);
    }
  });

  return {
    calls,
    enqueue: (...notifications: Notification[]) => queue.push(...notifications),
    releaseState: () => {
      stateHeld = false;
      waitingStates.splice(0).forEach((resolve) => resolve());
    },
    releaseReceive: () => {
      receiveHeld = false;
      waitingReceives.splice(0).forEach((resolve) => resolve());
    },
    receiveCount: () => calls.filter((call) => call.method === 'receiveNotification').length,
    maxActiveReceives: () => maxActiveReceives,
    resetReceiveConcurrency: () => {
      maxActiveReceives = activeReceives;
    },
  };
}

async function connect(page: Page) {
  await page.goto('/');
  await page.getByLabel('Адрес API', { exact: true }).fill(API_URL);
  await page.getByLabel('ID подключения', { exact: true }).fill(INSTANCE_ID);
  await page.getByLabel('Ключ доступа', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'Подключить Telegram', exact: true }).click();
}

async function createChat(page: Page, phone = '+7 (999) 123-45-67') {
  await page.getByRole('button', { name: 'Новый чат', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат' });
  await dialog.getByLabel('Номер телефона', { exact: true }).fill(phone);
  await dialog.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeVisible();
}

test('connects, resolves a phone to Telegram chatId, sends and receives with exact receipt acknowledgment', async ({
  page,
}) => {
  const mock = await installApiMock(page);
  await connect(page);
  await expect(page.getByText('Пока нет чатов', { exact: true })).toBeVisible();
  await createChat(page, '+7 (999) 123-45-67');
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'checkAccount')?.body)
    .toEqual({
      phoneNumber: PHONE,
    });
  const composer = page.getByLabel('Сообщение', { exact: true });
  await composer.fill('Привет, Telegram! 👋');
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'sendMessage')?.body)
    .toEqual({
      chatId: CHAT_ID,
      message: 'Привет, Telegram! 👋',
    });
  await expect(composer).toHaveValue('');
  // StrictMode aborts its first mount's receive. Check concurrency once startup has settled.
  mock.resetReceiveConcurrency();
  mock.enqueue(textNotification(101, 'incoming-1', 'Привет! Сообщение получено.'));
  await expect(
    page.getByRole('log').getByText('Привет! Сообщение получено.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('log').locator('p')).toHaveText([
    'Привет, Telegram! 👋',
    'Привет! Сообщение получено.',
  ]);
  await expect
    .poll(() =>
      mock.calls.filter((call) => call.method === 'deleteNotification').map((call) => call.url),
    )
    .toContain(`${API_URL}/waInstance${INSTANCE_ID}/deleteNotification/${TOKEN}/101`);
  expect(mock.calls.find((call) => call.method === 'deleteNotification')?.verb).toBe('DELETE');
  expect(mock.maxActiveReceives()).toBe(1);
  await page.screenshot({ path: 'screenshots/chat-desktop.png', fullPage: true });
});

test('acknowledges unsupported media, parses extended text and deduplicates after an ACK failure', async ({
  page,
}) => {
  const mock = await installApiMock(page, { deleteFailures: 1 });
  await connect(page);
  await createChat(page);
  const media = textNotification(201, 'media-1', 'Не показывать как текст');
  media.body.messageData = { typeMessage: 'imageMessage', fileMessageData: { caption: 'Фото' } };
  mock.enqueue(
    media,
    textNotification(
      202,
      'extended-1',
      'Ссылка: https://example.com',
      'incomingMessageReceived',
      true,
    ),
    textNotification(
      203,
      'extended-1',
      'Ссылка: https://example.com',
      'incomingMessageReceived',
      true,
    ),
  );
  await expect
    .poll(() =>
      mock.calls
        .filter((call) => call.method === 'deleteNotification')
        .map((call) => new URL(call.url).pathname.split('/').at(-1)),
    )
    .toEqual(['201', '201', '202', '203']);
  await expect(
    page.getByRole('log').getByText('Ссылка: https://example.com', { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('log').getByText('Не показывать как текст', { exact: true }),
  ).toHaveCount(0);
});

test('merges outgoing echo and preserves read status when events arrive before send response', async ({
  page,
}) => {
  const mock = await installApiMock(page, {
    sendDelay: 700,
    onSend: () =>
      mock.enqueue(
        statusNotification(301, 'outgoing-1', 'read'),
        textNotification(302, 'outgoing-1', 'Гонка статуса и ответа', 'outgoingAPIMessageReceived'),
      ),
  });
  await connect(page);
  await createChat(page);
  await page.getByLabel('Сообщение', { exact: true }).fill('Гонка статуса и ответа');
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect(page.getByLabel('Сообщение', { exact: true })).toHaveValue('');
  await expect(
    page.getByRole('log').getByText('Гонка статуса и ответа', { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('log').getByTitle('Прочитано', { exact: true })).toHaveCount(1);
});

test('rejects another messenger instance', async ({ page }) => {
  await installApiMock(page, { settings: { typeInstance: 'whatsapp' } });
  await connect(page);
  await expect(page.getByRole('alert')).toContainText(/Telegram/i);
  await expect(
    page.getByRole('button', { name: 'Подключить Telegram', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выйти из аккаунта' })).toHaveCount(0);
});

test('blocks connecting while an external webhook URL is configured', async ({ page }) => {
  const mock = await installApiMock(page, {
    settings: { webhookUrl: 'https://example.com/webhook' },
  });
  await connect(page);
  await expect(page.getByRole('alert')).toContainText(/приём сообщений через HTTP/i);
  await expect(
    page.getByText(/Настройка включит приём сообщений и очистит прежний Webhook URL/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Настроить приём сообщений', exact: true }),
  ).toBeVisible();
  expect(mock.receiveCount()).toBe(0);
});

test('rejects credentials without exposing the token or starting polling', async ({ page }) => {
  const mock = await installApiMock(page, { stateStatus: 401 });
  await connect(page);
  await expect(page.getByRole('alert')).toContainText(/доступ|токен|ID/i);
  await expect(page.getByRole('alert')).not.toContainText(TOKEN);
  expect(mock.receiveCount()).toBe(0);
  expect(mock.calls.filter((call) => call.method === 'getSettings')).toHaveLength(0);
  await expect(page.getByLabel('Ключ доступа', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
});

test('unlocks the preserved login after a 30 second timeout and connects after the service recovers', async ({
  page,
}) => {
  const mock = await installApiMock(page, { holdState: true });
  await page.clock.install();
  await connect(page);
  await expect
    .poll(() => mock.calls.filter((call) => call.method === 'getStateInstance').length)
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Подключаемся…', exact: true })).toBeDisabled();
  expect(mock.calls.filter((call) => call.method === 'getSettings')).toHaveLength(0);
  await page.clock.fastForward(31_000);
  const button = page.getByRole('button', { name: 'Подключить Telegram', exact: true });
  await expect(button).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('не ответил вовремя');
  await expect(page.getByRole('alert')).not.toContainText(/Повторяем подключение/i);
  await expect(page.getByRole('alert')).not.toContainText(TOKEN);
  await expect(
    page.getByRole('link', { name: 'Проверить статус GREEN-API', exact: true }),
  ).toHaveAttribute('href', 'https://status.green-api.com/');
  await expect(page.getByLabel('Адрес API', { exact: true })).toHaveValue(API_URL);
  await expect(page.getByLabel('ID подключения', { exact: true })).toHaveValue(INSTANCE_ID);
  await expect(page.getByLabel('Ключ доступа', { exact: true })).toHaveValue(TOKEN);
  expect(mock.calls.filter((call) => call.method === 'getStateInstance')).toHaveLength(1);
  expect(mock.calls.filter((call) => call.method === 'getSettings')).toHaveLength(0);
  mock.releaseState();
  await button.click();
  await expect(page.getByText('Пока нет чатов', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      mock.calls
        .filter((call) => call.method === 'getStateInstance' || call.method === 'getSettings')
        .map((call) => call.method),
    )
    .toEqual(['getStateInstance', 'getStateInstance', 'getSettings']);
});

test('shows the service status link and unlocks login when no network response is available', async ({
  page,
}) => {
  const mock = await installApiMock(page, { stateAbortCount: 1 });
  await connect(page);
  await expect(page.getByRole('alert')).toContainText('Не удалось связаться с сервером GREEN-API');
  await expect(page.getByRole('alert')).not.toContainText(TOKEN);
  await expect(
    page.getByRole('button', { name: 'Подключить Telegram', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('link', { name: 'Проверить статус GREEN-API', exact: true }),
  ).toHaveAttribute('href', 'https://status.green-api.com/');
  await expect(page.getByLabel('Адрес API', { exact: true })).toHaveValue(API_URL);
  await expect(page.getByLabel('ID подключения', { exact: true })).toHaveValue(INSTANCE_ID);
  await expect(page.getByLabel('Ключ доступа', { exact: true })).toHaveValue(TOKEN);
  expect(mock.calls.filter((call) => call.method === 'getStateInstance')).toHaveLength(1);
  expect(mock.calls.filter((call) => call.method === 'getSettings')).toHaveLength(0);
  expect(mock.receiveCount()).toBe(0);
});

test('changes instance notification settings only after the user presses the setup button', async ({
  page,
}) => {
  const mock = await installApiMock(page, { settings: { incomingWebhook: 'no' } });
  await connect(page);
  await expect(
    page.getByRole('button', { name: 'Настроить приём сообщений', exact: true }),
  ).toBeVisible();
  expect(mock.calls.filter((call) => call.method === 'setSettings')).toHaveLength(0);
  await page.getByRole('button', { name: 'Настроить приём сообщений', exact: true }).click();
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'setSettings')?.body)
    .toEqual({
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      stateWebhook: 'yes',
    });
  await expect(page.getByRole('status')).toContainText('Настройки сохранены');
  expect(mock.receiveCount()).toBe(0);
  await page.getByRole('button', { name: 'Подключить Telegram', exact: true }).click();
  await expect(page.getByText('Пока нет чатов', { exact: true })).toBeVisible();
});

test('offers notification setup when incoming is enabled but status and account events are disabled', async ({
  page,
}) => {
  const mock = await installApiMock(page, {
    settings: { incomingWebhook: 'yes', outgoingWebhook: 'no', stateWebhook: 'no' },
  });
  await connect(page);
  await expect(page.getByRole('alert')).toContainText(/приём сообщений через HTTP/i);
  await expect(
    page.getByRole('button', { name: 'Настроить приём сообщений', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Подключить Telegram', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выйти из аккаунта', exact: true })).toHaveCount(0);
  expect(mock.receiveCount()).toBe(0);
  expect(mock.calls.filter((call) => call.method === 'setSettings')).toHaveLength(0);
});

test('stops polling when GREEN-API revokes session access', async ({ page }) => {
  const mock = await installApiMock(page, { receiveStatus: 401 });
  await connect(page);
  await expect(page.getByText('Нет соединения', { exact: true })).toBeVisible();
  await createChat(page);
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Доступ отклонён');
  const stoppedAt = mock.receiveCount();
  await page.waitForTimeout(350);
  expect(mock.receiveCount()).toBe(stoppedAt);
});

test('keeps sending disabled after a notAuthorized state webhook and restores it on authorized', async ({
  page,
}) => {
  const mock = await installApiMock(page);
  await connect(page);
  await createChat(page);
  mock.enqueue({
    receiptId: 401,
    body: {
      typeWebhook: 'stateInstanceChanged',
      timestamp: Math.floor(Date.now() / 1000),
      stateInstance: 'notAuthorized',
    },
  });
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Подключение отключено');
  await page.waitForTimeout(300);
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeDisabled();
  mock.enqueue({
    receiptId: 402,
    body: {
      typeWebhook: 'stateInstanceChanged',
      timestamp: Math.floor(Date.now() / 1000),
      stateInstance: 'authorized',
    },
  });
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeEnabled();
  await expect(page.getByText('На связи', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      mock.calls
        .filter((call) => call.method === 'deleteNotification')
        .map((call) => new URL(call.url).pathname.split('/').at(-1)),
    )
    .toEqual(['401', '402']);
});

test('validates the phone before making CheckAccount and retains a nonexistent account error', async ({
  page,
}) => {
  const mock = await installApiMock(page, { accountExists: false });
  await connect(page);
  await page.getByRole('button', { name: 'Новый чат', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат' });
  await dialog.getByLabel('Номер телефона', { exact: true }).fill('123abc');
  await dialog.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(mock.calls.filter((call) => call.method === 'checkAccount')).toHaveLength(0);
  await dialog.getByLabel('Номер телефона', { exact: true }).fill('+7 (999) 123-45-67');
  await dialog.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    /не найден|нет аккаунта|не зарегистрирован/i,
  );
  await expect(dialog).toBeVisible();
});

test('keeps a failed message and retries only on an explicit user action', async ({ page }) => {
  const mock = await installApiMock(page, { sendFailures: 1 });
  await connect(page);
  await createChat(page);
  await page.getByLabel('Сообщение', { exact: true }).fill('Повторяем вручную');
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect(page.getByRole('log').getByText('Не отправлено', { exact: true })).toBeVisible();
  expect(mock.calls.filter((call) => call.method === 'sendMessage')).toHaveLength(1);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect
    .poll(() => mock.calls.filter((call) => call.method === 'sendMessage').length)
    .toBe(2);
  await expect(page.getByRole('log').getByText('Не отправлено', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('log').getByText('Повторяем вручную', { exact: true })).toHaveCount(
    1,
  );
});

test('explains uncertain delivery after a server failure and does not auto resend', async ({
  page,
}) => {
  const mock = await installApiMock(page, { sendFailures: 1, sendErrorStatus: 500 });
  await connect(page);
  await createChat(page);
  await page.getByLabel('Сообщение', { exact: true }).fill('Доставка неизвестна');
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect(
    page.getByRole('log').getByText('Возможно, уже отправлено', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Повторить отправку', exact: true }),
  ).toHaveAttribute('title', 'Повторная отправка может создать дубликат сообщения');
  await page.waitForTimeout(400);
  expect(mock.calls.filter((call) => call.method === 'sendMessage')).toHaveLength(1);
  await page.getByRole('button', { name: 'Повторить отправку', exact: true }).click();
  await expect
    .poll(() => mock.calls.filter((call) => call.method === 'sendMessage').length)
    .toBe(2);
  await expect(page.getByRole('log').getByText('Доставка неизвестна', { exact: true })).toHaveCount(
    1,
  );
});

test('sends with Enter, inserts a newline with Shift+Enter and preserves text content', async ({
  page,
}) => {
  const mock = await installApiMock(page);
  await connect(page);
  await createChat(page);
  const composer = page.getByLabel('Сообщение', { exact: true });
  await composer.fill('Первая строка');
  await composer.press('Shift+Enter');
  await composer.press('End');
  await composer.press('x');
  await composer.press('Enter');
  await expect
    .poll(() => mock.calls.filter((call) => call.method === 'sendMessage').length)
    .toBe(1);
  expect(mock.calls.find((call) => call.method === 'sendMessage')?.body).toEqual({
    chatId: CHAT_ID,
    message: 'Первая строка\nx',
  });
  await expect(composer).toHaveValue('');
  await expect(composer).toBeFocused();
});

test('does not send while composing input and treats HTML as message text', async ({ page }) => {
  const mock = await installApiMock(page);
  await connect(page);
  await createChat(page);
  const composer = page.getByLabel('Сообщение', { exact: true });
  const text = '<img src=x onerror=alert(1)> Текст';
  await composer.fill(text);
  await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(mock.calls.filter((call) => call.method === 'sendMessage')).toHaveLength(0);
  await expect(composer).toHaveValue(text);
  await composer.press('Enter');
  await expect(page.getByRole('log').getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByRole('log').locator('img')).toHaveCount(0);
});

test('disables sending a whitespace draft and limits text to 4096 characters with a counter', async ({
  page,
}) => {
  await installApiMock(page);
  await connect(page);
  await createChat(page);
  const composer = page.getByLabel('Сообщение', { exact: true });
  await composer.fill('   ');
  await expect(page.getByRole('button', { name: /^Отправить/ })).toBeDisabled();
  await composer.fill('я'.repeat(4096));
  await expect(page.getByText('4096 / 4096', { exact: true })).toBeVisible();
  await composer.press('End');
  await composer.press('x');
  await expect(composer).toHaveValue('я'.repeat(4096));
});

test('uses a mobile dialog and chat back navigation without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installApiMock(page);
  await connect(page);
  await page.getByRole('button', { name: 'Новый чат', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await dialog.getByLabel('Номер телефона', { exact: true }).fill('+7 (999) 123-45-67');
  await dialog.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeVisible();
  await page
    .getByLabel('Сообщение', { exact: true })
    .fill('https://example.com/' + 'длиннаястрока'.repeat(50));
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect(page.getByRole('log')).toBeVisible();
  await expect(page.getByLabel('Сообщение', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'screenshots/chat-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Вернуться к списку чатов', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Список чатов' })).toBeVisible();
  await expect(page.getByLabel('Сообщение', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: `+${PHONE}`, exact: true }).click();
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  ).toBe(true);
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'screenshots/chat-mobile-320.png', fullPage: true });
});

test('focuses a new mobile chat, counts replies after Back and reopens the existing phone chat', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await installApiMock(page);
  await connect(page);
  await createChat(page);
  const composer = page.getByLabel('Сообщение', { exact: true });
  await expect(composer).toBeFocused();
  await page.getByRole('button', { name: 'Вернуться к списку чатов', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Список чатов' })).toBeVisible();
  await expect(composer).not.toBeVisible();
  mock.enqueue(textNotification(701, 'mobile-incoming-1', 'Ответ пока чат закрыт'));
  await expect(
    page.getByRole('button', { name: 'Собеседник, непрочитанных: 1', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      mock.calls
        .filter((call) => call.method === 'deleteNotification')
        .map((call) => new URL(call.url).pathname.split('/').at(-1)),
    )
    .toContain('701');
  await createChat(page);
  await expect(composer).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(
    page.getByRole('log').getByText('Ответ пока чат закрыт', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /непрочитанных:/, includeHidden: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Собеседник', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(mock.calls.filter((call) => call.method === 'checkAccount')).toHaveLength(2);
});

test('logs out while a receive is in flight and ignores late session events', async ({ page }) => {
  const mock = await installApiMock(page, { holdReceive: true });
  await connect(page);
  await expect.poll(mock.receiveCount).toBeGreaterThanOrEqual(1);
  const pendingAtLogout = mock.receiveCount();
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Подключить Telegram', exact: true }),
  ).toBeVisible();
  mock.enqueue(textNotification(501, 'late-1', 'Поздний ответ старой сессии'));
  mock.releaseReceive();
  await page.waitForTimeout(300);
  expect(mock.receiveCount()).toBe(pendingAtLogout);
  await expect(page.getByText('Поздний ответ старой сессии', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Выйти из аккаунта', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Ключ доступа', { exact: true })).toHaveValue('');
});

test('opens the connection guide with a keyboard, traps focus and closes without changing credentials', async ({
  page,
}) => {
  const mock = await installApiMock(page);
  await page.goto('/');
  const guideButton = page.getByRole('button', { name: 'Как получить данные', exact: true });
  await expect(guideButton).toBeVisible();
  await page.screenshot({ path: 'screenshots/login-desktop.png', fullPage: true });
  await guideButton.focus();
  await guideButton.press('Enter');
  const guide = page.getByRole('dialog', { name: 'Как подключить Telegram', exact: true });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('GREEN-API');
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('Tab');
    expect(await guide.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: 'screenshots/connection-guide-desktop.png', fullPage: false });
  await page.keyboard.press('Escape');
  await expect(guide).not.toBeVisible();
  await expect(guideButton).toBeFocused();
  await guideButton.press('Enter');
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(guide).not.toBeVisible();
  await expect(guideButton).toBeFocused();
  await expect(page.getByLabel('Адрес API', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('ID подключения', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Ключ доступа', { exact: true })).toHaveValue('');
  expect(mock.calls).toHaveLength(0);
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Подключить Telegram', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `screenshots/login-mobile-${viewport.width}.png`,
      fullPage: true,
    });
    await guideButton.click();
    await expect(guide).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `screenshots/connection-guide-mobile-${viewport.width}.png`,
      fullPage: false,
    });
    const guideBox = await guide.boundingBox();
    expect(guideBox?.height).toBeLessThanOrEqual(viewport.height);
    const instructionLink = guide.getByRole('link', {
      name: 'Официальная инструкция',
      exact: false,
    });
    await instructionLink.scrollIntoViewIfNeeded();
    await expect(instructionLink).toBeInViewport();
    await guide.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(guide).not.toBeVisible();
  }
});

test('offers only Telegram, resolves an international number, sends 4096 characters and receives a reply', async ({
  page,
}) => {
  const phoneNumber = 4915112345678;
  const mock = await installApiMock(page);
  await page.goto('/');
  await expect(page.getByRole('option', { name: 'MAX', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Подключить Telegram', exact: true }),
  ).toBeVisible();
  await connect(page);
  await createChat(page, '+49 151 1234 5678');
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'checkAccount')?.body)
    .toEqual({ phoneNumber });
  const composer = page.getByLabel('Сообщение', { exact: true });
  await expect(composer).toHaveAttribute('maxlength', '4096');
  const message = 'Telegram '.padEnd(4096, 'я');
  await composer.fill(message);
  await composer.press('End');
  await composer.press('x');
  await expect(composer).toHaveValue(message);
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'sendMessage')?.body)
    .toEqual({ chatId: CHAT_ID, message });
  await expect(composer).toHaveValue('');
  const incoming = textNotification(601, 'telegram-incoming-1', 'Ответ из Telegram');
  incoming.body.instanceData = {
    idInstance: Number(INSTANCE_ID),
    typeInstance: 'telegram',
  };
  incoming.body.senderData = {
    chatId: CHAT_ID,
    chatType: 'user',
    sender: CHAT_ID,
    senderName: 'Собеседник',
    senderPhoneNumber: phoneNumber,
  };
  mock.enqueue(incoming);
  await expect(page.getByRole('log').getByText('Ответ из Telegram', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      mock.calls.filter((call) => call.method === 'deleteNotification').map((call) => call.url),
    )
    .toContain(`${API_URL}/waInstance${INSTANCE_ID}/deleteNotification/${TOKEN}/601`);
  expect(mock.calls.find((call) => call.method === 'deleteNotification')?.verb).toBe('DELETE');
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  ).toBe(true);
  await page.screenshot({ path: 'screenshots/chat-telegram-desktop.png', fullPage: true });
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
    ).toBe(true);
    await expect(composer).toBeVisible();
    await expect(
      page.getByRole('log').getByText('Ответ из Telegram', { exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `screenshots/chat-telegram-mobile-${viewport.width}.png`,
      fullPage: true,
    });
  }
});
