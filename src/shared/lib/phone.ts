import type { Messenger } from '@/shared/config';

/** Remove presentation formatting without changing the country code. */
export function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, '');
}
export function isValidPhoneNumber(value: string, messenger: Messenger = 'telegram'): boolean {
  if (messenger !== 'telegram') return false;
  if (!/^\+?[\d\s()-]+$/.test(value.trim())) return false;
  const digits = normalizePhoneNumber(value);
  return /^[1-9]\d{6,14}$/.test(digits);
}
export function formatPhoneNumber(value: string): string {
  return `+${normalizePhoneNumber(value)}`;
}
