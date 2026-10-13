import type { Messenger } from '@/shared/config';

/** Accept international numbers, plus common Russian domestic formatting. */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  const isRussianDomestic =
    !value.trim().startsWith('+') && digits.length === 11 && digits.startsWith('8');
  return isRussianDomestic ? `7${digits.slice(1)}` : digits;
}
export function isValidPhoneNumber(value: string, messenger: Messenger = 'max'): boolean {
  if (!/^\+?[\d\s()-]+$/.test(value.trim())) return false;
  const digits = normalizePhoneNumber(value);
  return messenger === 'max'
    ? /^(?:7\d{10}|375\d{9})$/.test(digits)
    : /^[1-9]\d{6,14}$/.test(digits);
}
export function formatPhoneNumber(value: string): string {
  return /^7\d{10}$/.test(value)
    ? `+7 ${value.slice(1, 4)} ${value.slice(4, 7)}-${value.slice(7, 9)}-${value.slice(9)}`
    : `+${value}`;
}
