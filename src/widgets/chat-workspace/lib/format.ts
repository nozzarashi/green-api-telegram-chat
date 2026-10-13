const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const sidebarDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

export function getDateKey(timestamp: number) {
  return new Date(timestamp).toDateString();
}

export function formatMessageTime(timestamp: number) {
  return timeFormatter.format(timestamp);
}

export function formatChatTime(timestamp: number) {
  if (getDateKey(timestamp) === getDateKey(Date.now())) return formatMessageTime(timestamp);
  return sidebarDateFormatter.format(timestamp);
}

export function formatMessageDate(timestamp: number) {
  if (getDateKey(timestamp) === getDateKey(Date.now())) return 'Сегодня';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (getDateKey(timestamp) === yesterday.toDateString()) return 'Вчера';
  const date = new Date(timestamp);
  const year = date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${dateFormatter.format(timestamp)}${year}`;
}

export function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  if (/^\+?[\d\s()-]+$/.test(name)) return name.replace(/\D/g, '').slice(-2) || 'М';
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase('ru-RU');
}
