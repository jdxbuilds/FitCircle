import type { Config } from '../config.js';

export interface Sms {
  send(toE164: string, message: string): Promise<void>;
  /** True when codes are only printed to the log (development). */
  readonly isConsole: boolean;
}

export function createSms(config: Config, log: (msg: string) => void = console.log): Sms {
  if (config.SMS_DRIVER === 'console') {
    return { isConsole: true, async send(to, message) { log(`[sms to ${to}] ${message}`); } };
  }
  const host = config.AT_USERNAME === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  return {
    isConsole: false,
    async send(to, message) {
      const body = new URLSearchParams({ username: config.AT_USERNAME!, to, message });
      if (config.AT_SENDER_ID) body.set('from', config.AT_SENDER_ID);
      const res = await fetch(`${host}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: config.AT_API_KEY!, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`Africa's Talking SMS failed: ${res.status} ${await res.text()}`);
    },
  };
}
