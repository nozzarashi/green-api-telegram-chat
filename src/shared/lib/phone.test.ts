import { describe, expect, it } from 'vitest';
import { isValidPhoneNumber, normalizePhoneNumber } from './phone';

describe('messenger phone validation', () => {
  it('normalizes Russian domestic numbers and keeps MAX limited to Russia and Belarus', () => {
    expect(normalizePhoneNumber('8 (999) 123-45-67')).toBe('79991234567');
    expect(isValidPhoneNumber('8 (999) 123-45-67')).toBe(true);
    expect(isValidPhoneNumber('+375 29 123-45-67')).toBe(true);
    expect(isValidPhoneNumber('+44 7911 123456')).toBe(false);
  });

  it('accepts international Telegram numbers without rewriting explicit country code +81', () => {
    expect(isValidPhoneNumber('+44 7911 123456', 'telegram')).toBe(true);
    expect(isValidPhoneNumber('+81 3 1234 5678', 'telegram')).toBe(true);
    expect(normalizePhoneNumber('+81 3 1234 5678')).toBe('81312345678');
    expect(isValidPhoneNumber('+81312345678', 'max')).toBe(false);
  });

  it.each(['123456', '1234567890123456', '+0123456789', 'number 79991234567', '7999<>1234567'])(
    'rejects unsupported international input %s',
    (input) => {
      expect(isValidPhoneNumber(input, 'telegram')).toBe(false);
    },
  );

  it('accepts the longest supported E.164 number without losing integer precision', () => {
    const number = '999999999999999';
    expect(isValidPhoneNumber(number, 'telegram')).toBe(true);
    expect(Number.isSafeInteger(Number(normalizePhoneNumber(number)))).toBe(true);
  });
});
