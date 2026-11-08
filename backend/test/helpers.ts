import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp, type Ctx } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createStorage } from '../src/lib/storage.js';
import { createPayments } from '../src/payments/providers.js';

export interface TestApp {
  app: FastifyInstance;
  ctx: Ctx;
  sms: string[];
  close(): Promise<void>;
}

export async function makeApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_USER: process.env.TEST_DB_USER ?? 'root',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? '',
    DB_NAME: process.env.TEST_DB_NAME ?? 'fitcircle_test',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    MPESA_CALLBACK_TOKEN: 'test-callback-token-123456',
    FLW_WEBHOOK_HASH: 'test-flw-hash',
    RATE_LIMIT: 'off',
    ...overrides,
  });
  const db = createDb(config);
  const sms: string[] = [];
  const ctx: Ctx = {
    config,
    db,
    sms: { isConsole: true, async send(to, msg) { sms.push(`${to}: ${msg}`); } },
    storage: createStorage(config),
    payments: createPayments(config),
  };
  const app = await buildApp(ctx);
  return { app, ctx, sms, close: async () => { await app.close(); await db.end(); } };
}

let phoneSeq = 0;
/** A fresh unique Kenyan number per call, so test files never collide. */
export const newPhone = () => `07${String(10_000_000 + Math.floor(Math.random() * 80_000_000) + ++phoneSeq).slice(0, 8)}`;

export const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
};

/** Today in Nairobi as YYYY-MM-DD. */
export const todayEAT = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export async function call(t: TestApp, method: InjectOptions['method'], url: string, token?: string, payload?: unknown) {
  const res = await t.app.inject({ method, url, payload: payload as InjectOptions['payload'], headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.body ? res.json() : null };
}

/** Full sign-up through the SMS code flow. Returns the session token and user id. */
export async function signUp(t: TestApp, firstName: string, age = 25, phone = newPhone()) {
  const otp = await call(t, 'POST', '/auth/otp', undefined, { phone });
  const verify = await call(t, 'POST', '/auth/verify', undefined, { phone, code: otp.body.devCode });
  const signup = await call(t, 'POST', '/auth/signup', undefined, { signupToken: verify.body.signupToken, firstName, dateOfBirth: yearsAgo(age), acceptTerms: true });
  if (signup.status !== 200) throw new Error(`signup failed: ${JSON.stringify(signup.body)}`);
  return { token: signup.body.token as string, id: signup.body.userId as number, phone };
}

/** Pays a stake or fee using the development payment flow. */
export async function pay(t: TestApp, token: string, challengeId: number) {
  const start = await call(t, 'POST', `/challenges/${challengeId}/payments`, token, { provider: 'mpesa' });
  if (start.status !== 201) throw new Error(`payment failed: ${JSON.stringify(start.body)}`);
  await call(t, 'POST', `/dev/payments/${start.body.paymentId}/complete`, token);
  return start.body.paymentId as number;
}

/** Uploads (pretend) proof and logs today's session. */
export async function logToday(t: TestApp, token: string, challengeId: number, extra: Record<string, unknown> = {}) {
  const up = await call(t, 'POST', `/challenges/${challengeId}/uploads`, token, { contentType: 'image/jpeg' });
  if (up.status !== 200) return up;
  return call(t, 'POST', `/challenges/${challengeId}/logs`, token, { key: up.body.key, activity: 'run', ...extra });
}
