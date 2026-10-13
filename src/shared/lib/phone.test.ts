import { describe, expect, it } from 'vitest';
import { formatPhoneNumber, isValidPhoneNumber, normalizePhoneNumber } from './phone';

describe('Telegram phone validation', () => {
  it('accepts international numbers without restricting country codes', () => {
    expect(isValidPhoneNumber('+7 (999) 123-45-67')).toBe(true);
    expect(isValidPhoneNumber('+375 29 123-45-67')).toBe(true);
    expect(isValidPhoneNumber('+44 7911 123456')).toBe(true);
    expect(isValidPhoneNumber('+81 3 1234 5678')).toBe(true);
  });

  it('removes formatting and preserves country codes even without a plus', () => {
    expect(normalizePhoneNumber('+81 3 1234 5678')).toBe('81312345678');
    expect(normalizePhoneNumber('81 3 1234 5678')).toBe('81312345678');
    expect(formatPhoneNumber('+44 (7911) 123456')).toBe('+447911123456');
  });

  it.each([
    '',
    '123456',
    '1234567890123456',
    '+0123456789',
    'number 79991234567',
    '7999<>1234567',
    '44+7911123456',
  ])('rejects unsupported international input %s', (input) => {
    expect(isValidPhoneNumber(input, 'telegram')).toBe(false);
  });

  it('accepts the shortest supported international number', () => {
    expect(isValidPhoneNumber('+4479111')).toBe(true);
  });

  it('accepts the longest supported E.164 number without losing integer precision', () => {
    const number = '999999999999999';
    expect(isValidPhoneNumber(number, 'telegram')).toBe(true);
    expect(Number.isSafeInteger(Number(normalizePhoneNumber(number)))).toBe(true);
  });
});
