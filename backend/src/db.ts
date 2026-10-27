import awsCaBundle from 'aws-ssl-profiles';
import mysql from 'mysql2/promise';
import type { Config } from './config.js';

export type Db = mysql.Pool;
export type Conn = mysql.PoolConnection;
export type Row = mysql.RowDataPacket;

export const sslFor = (config: Config) => (config.DB_SSL === 'rds' ? { ...awsCaBundle, rejectUnauthorized: true } : undefined);

export function createDb(config: Config): Db {
  const pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    ssl: sslFor(config),
    connectionLimit: 10,
    timezone: '+03:00',
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
  });
  // "Today" in the database must be Nairobi's day: same-day proof depends on it.
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+03:00'");
  });
  return pool;
}

export async function rows<T = Row>(db: Db | Conn, sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await db.query(sql, params);
  return result as T[];
}

export async function one<T = Row>(db: Db | Conn, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(db, sql, params))[0];
}

export async function exec(db: Db | Conn, sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  const [result] = await db.query(sql, params);
  return result as mysql.ResultSetHeader;
}

export async function tx<T>(db: Db, fn: (conn: Conn) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
