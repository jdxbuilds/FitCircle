import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createSms } from './lib/sms.js';
import { createStorage } from './lib/storage.js';
import { createPayments } from './payments/providers.js';

const config = loadConfig();
const db = createDb(config);
const app = await buildApp({ config, db, sms: createSms(config), storage: createStorage(config), payments: createPayments(config) });

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: config.PORT });
