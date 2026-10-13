import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const API_URL = 'https://3100.api.green-api.com';
const INSTANCE_ID = '3100000001';
const TOKEN = 'test_token_not_a_real_secret';
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
  settings?: Record<string, unknown>;
  stateStatus?: number;
  state?: string;
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
      instanceData: { idInstance: Number(INSTANCE_ID), typeInstance: 'v3' },
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
  const calls: ApiCall[] = [];
  const queue: Notification[] = [];
  let sendFailures = options.sendFailures ?? 0;
  let deleteFailures = options.deleteFailures ?? 0;
  let activeReceives = 0;
  let maxActiveReceives = 0;
  let receiveHeld = options.holdReceive ?? false;
  const waitingReceives: Array<() => void> = [];
  const settings = {
    typeInstance: 'v3',
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

  await page.route(`${API_URL}/waInstance${INSTANCE_ID}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/');
    const method = parts[2] ?? '';
    let body: unknown = null;
    if (request.postData()) body = request.postDataJSON();
    calls.push({ method, verb: request.method(), url: request.url(), body });

    if (method === 'getStateInstance') {
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
  await page.getByLabel('apiUrl', { exact: true }).fill(API_URL);
  await page.getByLabel('idInstance', { exact: true }).fill(INSTANCE_ID);
  await page.getByLabel('apiTokenInstance', { exact: true }).fill(TOKEN);
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
}

async function createChat(page: Page, phone = '+7 (999) 123-45-67') {
  await page.getByRole('button', { name: 'Новый чат', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат' });
  await dialog.getByLabel('Номер телефона', { exact: true }).fill(phone);
  await dialog.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeVisible();
}

test('connects, resolves a phone to MAX chatId, sends and receives with exact receipt acknowledgment', async ({
  page,
}) => {
  const mock = await installApiMock(page);
  await connect(page);
  await expect(page.getByText('Пока нет чатов', { exact: true })).toBeVisible();
  await createChat(page, '8 (999) 123-45-67');
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'checkAccount')?.body)
    .toEqual({
      phoneNumber: PHONE,
    });
  const composer = page.getByLabel('Сообщение', { exact: true });
  await composer.fill('Привет, MAX! 👋');
  await page.getByRole('button', { name: /^Отправить/ }).click();
  await expect
    .poll(() => mock.calls.find((call) => call.method === 'sendMessage')?.body)
    .toEqual({
      chatId: CHAT_ID,
      message: 'Привет, MAX! 👋',
    });
  await expect(composer).toHaveValue('');
  // StrictMode aborts its first mount's receive. Check concurrency once startup has settled.
  mock.resetReceiveConcurrency();
  mock.enqueue(textNotification(101, 'incoming-1', 'Привет! Сообщение получено.'));
  await expect(
    page.getByRole('log').getByText('Привет! Сообщение получено.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('log').locator('p')).toHaveText([
    'Привет, MAX! 👋',
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
  await expect(page.getByRole('alert')).toContainText(/MAX/i);
  await expect(page.getByRole('button', { name: 'Подключиться', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выйти из аккаунта' })).toHaveCount(0);
});

test('blocks connecting while an external webhook URL is configured', async ({ page }) => {
  const mock = await installApiMock(page, {
    settings: { webhookUrl: 'https://example.com/webhook' },
  });
  await connect(page);
  await expect(page.getByRole('alert')).toContainText(/приём сообщений через HTTP/i);
  await expect(page.getByText(/Кнопка очистит Webhook URL/)).toBeVisible();
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
  await expect(page.getByLabel('apiTokenInstance', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
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
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Подключиться', exact: true })).toBeVisible();
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
  await expect(page.getByRole('status')).toContainText('Инстанс отключён');
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

test('limits message text to 4000 characters and shows the character count', async ({ page }) => {
  await installApiMock(page);
  await connect(page);
  await createChat(page);
  const composer = page.getByLabel('Сообщение', { exact: true });
  await composer.fill('я'.repeat(4000));
  await expect(page.getByText('4000 / 4000', { exact: true })).toBeVisible();
  await composer.press('End');
  await composer.press('x');
  await expect(composer).toHaveValue('я'.repeat(4000));
});

test('uses a mobile dialog and chat back navigation without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.getByRole('button', { name: /\+7 999 123-45-67/ }).click();
  await expect(page.getByLabel('Сообщение', { exact: true })).toBeVisible();
});

test('logs out while a receive is in flight and ignores late session events', async ({ page }) => {
  const mock = await installApiMock(page, { holdReceive: true });
  await connect(page);
  await expect.poll(mock.receiveCount).toBeGreaterThanOrEqual(1);
  const pendingAtLogout = mock.receiveCount();
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Подключиться', exact: true })).toBeVisible();
  mock.enqueue(textNotification(501, 'late-1', 'Поздний ответ старой сессии'));
  mock.releaseReceive();
  await page.waitForTimeout(300);
  expect(mock.receiveCount()).toBe(pendingAtLogout);
  await expect(page.getByText('Поздний ответ старой сессии', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Выйти из аккаунта', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('apiTokenInstance', { exact: true })).toHaveValue('');
});
