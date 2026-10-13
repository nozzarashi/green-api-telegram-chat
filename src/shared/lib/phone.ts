/** Accept international numbers, plus common Russian domestic formatting. */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
}
export function isValidPhoneNumber(value: string): boolean {
  return (
    /^(?:7\d{10}|375\d{9})$/.test(normalizePhoneNumber(value)) && /^\+?[\d\s()-]+$/.test(value)
  );
}
export function formatPhoneNumber(value: string): string {
  return /^7\d{10}$/.test(value)
    ? `+7 ${value.slice(1, 4)} ${value.slice(4, 7)}-${value.slice(7, 9)}-${value.slice(9)}`
    : `+${value}`;
}
