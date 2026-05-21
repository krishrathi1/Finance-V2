import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db.json');

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [],
      refresh_tokens: [],
      password_reset_tokens: [],
      watchlists: [],
      portfolios: [],
      premium_requests: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return {
      users: [],
      refresh_tokens: [],
      password_reset_tokens: [],
      watchlists: [],
      portfolios: [],
      premium_requests: []
    };
  }
}

function writeDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

export async function query(sql: string, values: any[] = []): Promise<any> {
  const db = readDb();
  const normalizedSql = sql.trim().replace(/\s+/g, ' ');

  // CREATE TABLE patterns (always return success)
  if (normalizedSql.toUpperCase().startsWith('CREATE TABLE')) {
    return { affectedRows: 0 };
  }

  // 1. SELECT * FROM users WHERE email = ?
  if (normalizedSql.match(/SELECT \* FROM users WHERE email = \?/i)) {
    const email = values[0];
    return db.users.filter((u: any) => u.email === email);
  }

  // 2. SELECT id FROM users WHERE email = ?
  if (normalizedSql.match(/SELECT id FROM users WHERE email = \?/i)) {
    const email = values[0];
    return db.users.filter((u: any) => u.email === email).map((u: any) => ({ id: u.id }));
  }

  // 3. INSERT INTO users
  if (normalizedSql.match(/INSERT INTO users/i)) {
    const newUser = {
      id: db.users.length > 0 ? Math.max(...db.users.map((u: any) => u.id)) + 1 : 1,
      email: values[0],
      name: values[1],
      password_hash: values[2],
      tier: values[3] || 'free',
      is_admin: false,
      is_banned: false,
      verified_email: values[4] || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDb(db);
    return { insertId: newUser.id };
  }

  // 4. INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)
  if (normalizedSql.match(/INSERT INTO refresh_tokens/i)) {
    const newToken = {
      id: db.refresh_tokens.length > 0 ? Math.max(...db.refresh_tokens.map((t: any) => t.id)) + 1 : 1,
      user_id: values[0],
      token_hash: values[1],
      expires_at: values[2] instanceof Date ? values[2].toISOString() : values[2],
      created_at: new Date().toISOString()
    };
    db.refresh_tokens.push(newToken);
    writeDb(db);
    return { insertId: newToken.id };
  }

  // 5. SELECT * FROM refresh_tokens WHERE token_hash = ?
  if (normalizedSql.match(/SELECT \* FROM refresh_tokens WHERE token_hash = \?/i)) {
    const tokenHash = values[0];
    return db.refresh_tokens.filter((t: any) => t.token_hash === tokenHash);
  }

  // 6. DELETE FROM refresh_tokens WHERE id = ?
  if (normalizedSql.match(/DELETE FROM refresh_tokens WHERE id = \?/i)) {
    const id = values[0];
    db.refresh_tokens = db.refresh_tokens.filter((t: any) => t.id !== id);
    writeDb(db);
    return { affectedRows: 1 };
  }

  // 7. DELETE FROM refresh_tokens WHERE token_hash = ?
  if (normalizedSql.match(/DELETE FROM refresh_tokens WHERE token_hash = \?/i)) {
    const hash = values[0];
    db.refresh_tokens = db.refresh_tokens.filter((t: any) => t.token_hash !== hash);
    writeDb(db);
    return { affectedRows: 1 };
  }

  // 8. SELECT * FROM users WHERE id = ?
  if (normalizedSql.match(/SELECT \* FROM users WHERE id = \?/i)) {
    const id = values[0];
    return db.users.filter((u: any) => u.id === id);
  }

  // 9. UPDATE users SET password_hash = ? WHERE id = ?
  if (normalizedSql.match(/UPDATE users SET password_hash = \? WHERE id = \?/i)) {
    const passwordHash = values[0];
    const id = values[1];
    db.users = db.users.map((u: any) => u.id === id ? { ...u, password_hash: passwordHash, updated_at: new Date().toISOString() } : u);
    writeDb(db);
    return { affectedRows: 1 };
  }

  // 10. INSERT INTO password_reset_tokens (user_id, otp, expires_at) VALUES (?, ?, ?)
  if (normalizedSql.match(/INSERT INTO password_reset_tokens/i)) {
    const newToken = {
      id: db.password_reset_tokens.length > 0 ? Math.max(...db.password_reset_tokens.map((t: any) => t.id)) + 1 : 1,
      user_id: values[0],
      otp: values[1],
      is_used: false,
      expires_at: values[2] instanceof Date ? values[2].toISOString() : values[2],
      created_at: new Date().toISOString()
    };
    db.password_reset_tokens.push(newToken);
    writeDb(db);
    return { insertId: newToken.id };
  }

  // 11. SELECT * FROM password_reset_tokens WHERE user_id = ? AND otp = ? AND is_used = false ...
  if (normalizedSql.match(/SELECT \* FROM password_reset_tokens/i)) {
    const userId = values[0];
    const otp = values[1];
    return db.password_reset_tokens
      .filter((t: any) => t.user_id === userId && t.otp === otp && !t.is_used && new Date(t.expires_at) > new Date())
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // 12. UPDATE password_reset_tokens SET is_used = true WHERE id = ?
  if (normalizedSql.match(/UPDATE password_reset_tokens SET is_used = (true|1) WHERE id = \?/i)) {
    const id = values[0];
    db.password_reset_tokens = db.password_reset_tokens.map((t: any) => t.id === id ? { ...t, is_used: true } : t);
    writeDb(db);
    return { affectedRows: 1 };
  }

  // 13. DELETE FROM password_reset_tokens WHERE user_id = ?
  if (normalizedSql.match(/DELETE FROM password_reset_tokens WHERE user_id = \?/i)) {
    const userId = values[0];
    db.password_reset_tokens = db.password_reset_tokens.filter((t: any) => t.user_id !== userId);
    writeDb(db);
    return { affectedRows: 1 };
  }

  return [];
}

export async function getConnection() {
  return {
    execute: async (sql: string, values: any[] = []) => {
      const results = await query(sql, values);
      return [results];
    },
    end: async () => {}
  } as any;
}

export async function closeConnection() {}
