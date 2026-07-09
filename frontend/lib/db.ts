/**
 * Real MySQL data layer (mysql2 pool).
 *
 * Replaces the previous JSON-file stub. `query()` returns the rows array for
 * SELECTs and a ResultSetHeader ({ insertId, affectedRows }) for writes — the
 * exact shape the auth/portfolio routes already expect.
 *
 * A single pool is cached on globalThis so Next.js dev hot-reloads don't leak
 * connections.
 */

import mysql, { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type { ResultSetHeader, RowDataPacket };

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: Pool | undefined;
}

function createPool(): Pool {
  return mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "financial_forensics",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    // Allow JS Date params and return DATETIME as strings (stable JSON).
    dateStrings: true,
  });
}

export function getPool(): Pool {
  if (!global.__mysqlPool) {
    global.__mysqlPool = createPool();
  }
  return global.__mysqlPool;
}

/**
 * Run a parameterized SQL statement.
 * @returns rows array for SELECT, ResultSetHeader ({insertId, affectedRows}) for writes.
 * Pass a type argument to get a typed result instead of `any`, e.g.
 * `query<ResultSetHeader>(...)` for an INSERT/UPDATE to access `.insertId`/
 * `.affectedRows` without an `as any` cast at the call site.
 */
export async function query<T = any>(sql: string, values: any[] = []): Promise<T> {
  const pool = getPool();
  const [result] = await pool.query(sql, values);
  return result as T;
}

/** Compatibility shim for callers that used a raw connection. */
export async function getConnection() {
  const pool = getPool();
  return {
    execute: async (sql: string, vals: any[] = []) => {
      const [rows] = await pool.query(sql, vals);
      return [rows];
    },
    end: async () => {},
  } as any;
}

export async function closeConnection() {
  if (global.__mysqlPool) {
    await global.__mysqlPool.end();
    global.__mysqlPool = undefined;
  }
}
