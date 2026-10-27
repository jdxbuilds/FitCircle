import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
    RATE_LIMIT: z.enum(['on', 'off']).default('on'),

    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().default(3306),
    DB_USER: z.string().default('root'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().default('fitcircle'),
    DB_SSL: z.enum(['off', 'rds']).default('off'), // 'rds' = TLS verified against Amazon RDS certificates

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

    SMS_DRIVER: z.enum(['console', 'africastalking']).default('console'),
    AT_USERNAME: z.string().optional(),
    AT_API_KEY: z.string().optional(),
    AT_SENDER_ID: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    S3_BUCKET: z.string().optional(),
    AWS_REGION: z.string().default('af-south-1'),

    PAYMENTS_DRIVER: z.enum(['fake', 'live']).default('fake'),
    MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    MPESA_CONSUMER_KEY: z.string().optional(),
    MPESA_CONSUMER_SECRET: z.string().optional(),
    MPESA_SHORTCODE: z.string().optional(),
    MPESA_PASSKEY: z.string().optional(),
    MPESA_CALLBACK_TOKEN: z.string().min(16).default('dev-callback-token-change-me'),
    MPESA_B2C_SHORTCODE: z.string().optional(),
    MPESA_B2C_INITIATOR: z.string().optional(),
    MPESA_B2C_SECURITY_CREDENTIAL: z.string().optional(),
    FLW_SECRET_KEY: z.string().optional(),
    FLW_WEBHOOK_HASH: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const need = (keys: (keyof typeof c)[], why: string) => {
      for (const k of keys) if (!c[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} is required when ${why}` });
    };
    if (c.SMS_DRIVER === 'africastalking') need(['AT_USERNAME', 'AT_API_KEY'], 'SMS_DRIVER=africastalking');
    if (c.STORAGE_DRIVER === 's3') need(['S3_BUCKET'], 'STORAGE_DRIVER=s3');
    if (c.PAYMENTS_DRIVER === 'live')
      need(['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'FLW_SECRET_KEY', 'FLW_WEBHOOK_HASH'], 'PAYMENTS_DRIVER=live');
    if (c.NODE_ENV === 'production') {
      if (c.RATE_LIMIT === 'off') ctx.addIssue({ code: 'custom', path: ['RATE_LIMIT'], message: 'rate limiting must stay on in production' });
      if (c.PAYMENTS_DRIVER === 'fake') ctx.addIssue({ code: 'custom', path: ['PAYMENTS_DRIVER'], message: 'fake payments are not allowed in production' });
      if (c.STORAGE_DRIVER === 'local') ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'local storage is not allowed in production' });
      if (c.SMS_DRIVER === 'console') ctx.addIssue({ code: 'custom', path: ['SMS_DRIVER'], message: 'console SMS is not allowed in production' });
      if (c.MPESA_CALLBACK_TOKEN === 'dev-callback-token-change-me')
        ctx.addIssue({ code: 'custom', path: ['MPESA_CALLBACK_TOKEN'], message: 'set a real MPESA_CALLBACK_TOKEN in production' });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${lines}`);
  }
  return parsed.data;
}
