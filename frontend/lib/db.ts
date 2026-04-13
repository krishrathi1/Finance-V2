import mysql from 'mysql2/promise';
import { Pool } from 'mysql2/promise';

let pool: Pool | null = null;

export async function getConnection() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'financial_forensics',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query(sql: string, values?: any[]) {
  const pool = await getConnection();
  const [results] = await pool.execute(sql, values);
  return results;
}

export async function closeConnection() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
