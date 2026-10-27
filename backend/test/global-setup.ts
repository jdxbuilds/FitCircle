import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { applySchema } from '../src/lib/schema.js';

/**
 * Rebuilds the throwaway test database (fitcircle_test) from db/schema.sql before the run,
 * using the same loader as `npm run migrate`, so the tests also prove the migration works.
 */
export default async function setup() {
  const db = process.env.TEST_DB_NAME ?? 'fitcircle_test';
  const conn = await mysql.createConnection({
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    user: process.env.TEST_DB_USER ?? 'root',
    password: process.env.TEST_DB_PASSWORD ?? '',
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${db}\``);
    await applySchema(conn, readFileSync(resolve(__dirname, '../../db/schema.sql'), 'utf8'), db);
  } finally {
    await conn.end();
  }
}
