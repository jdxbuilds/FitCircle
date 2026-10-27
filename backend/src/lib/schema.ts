import type mysql from 'mysql2/promise';

/**
 * Splits a .sql file into statements the way the mysql client does,
 * honouring DELIMITER blocks (used for triggers and procedures).
 * Full-line `--` comments are dropped; a statement ends when a line ends with the current delimiter.
 */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let delimiter = ';';
  let buf: string[] = [];
  for (const raw of sql.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!buf.length && /^\s*(--|$)/.test(line)) continue;
    const d = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (d) {
      delimiter = d[1];
      continue;
    }
    if (/^\s*--/.test(line)) continue;
    if (line.endsWith(delimiter)) {
      buf.push(line.slice(0, -delimiter.length));
      const stmt = buf.join('\n').trim();
      if (stmt) out.push(stmt);
      buf = [];
    } else {
      buf.push(line);
    }
  }
  const rest = buf.join('\n').trim();
  if (rest) out.push(rest);
  return out;
}

/** Applies db/schema.sql, renaming the `fitcircle` database to `dbName`. */
export async function applySchema(conn: mysql.Connection, sql: string, dbName: string) {
  const renamed = sql
    .replace('CREATE DATABASE IF NOT EXISTS fitcircle', `CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
    .replace('USE fitcircle;', `USE \`${dbName}\`;`);
  for (const stmt of splitSql(renamed)) await conn.query(stmt);
}
