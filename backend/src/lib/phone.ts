/**
 * Normalises Kenyan mobile numbers to E.164 (+2547XXXXXXXX / +2541XXXXXXXX).
 * Accepts 0712345678, 712345678, 254712345678, +254 712 345 678.
 * Returns null for anything else.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let local: string;
  if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  else return null;
  return `+254${local}`;
}

/** M-Pesa wants 2547XXXXXXXX with no plus sign. */
export const mpesaPhone = (e164: string) => e164.replace(/^\+/, '');
