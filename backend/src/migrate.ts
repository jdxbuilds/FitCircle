import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { loadConfig } from './config.js';
import { sslFor } from './db.js';
import { applySchema } from './lib/schema.js';

/**
 * Creates the database from db/schema.sql if it does not exist yet.
 * On AWS RDS the parameter group must set log_bin_trust_function_creators = 1
 * so triggers can be created (the CDK stack in infra/ does this).
 */
const config = loadConfig();
const schemaPath = resolve(process.env.SCHEMA_PATH ?? 'db/schema.sql');

const conn = await mysql.createConnection({ host: config.DB_HOST, port: config.DB_PORT, user: config.DB_USER, password: config.DB_PASSWORD, ssl: sslFor(config) });
try {
  const [existing] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [config.DB_NAME, 'users']);
  if ((existing as { n: number }[])[0].n > 0) {
    console.log(`Database ${config.DB_NAME} already exists. Nothing to do.`);
  } else {
    await applySchema(conn, await readFile(schemaPath, 'utf8'), config.DB_NAME);
    console.log(`Created database ${config.DB_NAME}`);
  }
} finally {
  await conn.end();
}
