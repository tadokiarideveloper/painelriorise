function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function clean(value, max = 5000) { return String(value ?? "").trim().slice(0, max); }
async function ensureSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL,
    server TEXT NOT NULL DEFAULT '39',
    role_level INTEGER NOT NULL DEFAULT 1,
    blocked INTEGER NOT NULL DEFAULT 0,
    is_super INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`).run();
}
function roleName(level) {
  if (Number(level) === 3) return "Desenvolvedor";
  if (Number(level) === 2) return "Líder";
  return "Admin";
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado. Crie o binding DB no Cloudflare." }, 500);
  if (!env.ADMIN_PASS) return json({ error: "Credenciais não configuradas. Defina ADMIN_PASS nas variáveis do Cloudflare." }, 500);
  await ensureSchema(env);

  const body = await readJson(request);
  const username = clean(body.username, 80);
  const password = String(body.password || "");
  const nowIso = new Date().toISOString();

  const defaultUser = "developer";
  const defaultPass = String(env.ADMIN_PASS || "");
  const legacyUser = clean(env.ADMIN_USER || "adminkiari", 80);

  const existingDeveloper = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(defaultUser).first();
  const existingLegacy = legacyUser && legacyUser !== defaultUser
    ? await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(legacyUser).first()
    : null;

  if (!existingDeveloper && existingLegacy) {
    await env.DB.prepare(`
      UPDATE users
      SET username = ?,
          password = ?,
          nickname = 'Desenvolvedor',
          server = '39',
          role_level = 3,
          is_super = 1,
          blocked = 0,
          updated_at = ?
      WHERE username = ?
    `).bind(defaultUser, defaultPass, nowIso, legacyUser).run();
    await env.DB.prepare("UPDATE sessions SET username = ? WHERE username = ?").bind(defaultUser, legacyUser).run();
    await env.DB.prepare("UPDATE punishments SET created_by_username = ?, created_by = ? WHERE created_by_username = ? OR created_by = ?").bind(defaultUser, "Desenvolvedor", legacyUser, "Admin Kiari").run();
  } else if (!existingDeveloper) {
    await env.DB.prepare(`INSERT INTO users
      (id, username, password, nickname, server, role_level, blocked, is_super, created_at, updated_at)
      VALUES (?, ?, ?, ?, '39', 3, 0, 1, ?, ?)`)
      .bind(crypto.randomUUID(), defaultUser, defaultPass, "Desenvolvedor", nowIso, nowIso).run();
  } else {
    await env.DB.prepare(`
      UPDATE users
      SET password = ?,
          nickname = 'Desenvolvedor',
          server = '39',
          role_level = 3,
          is_super = 1,
          blocked = 0,
          updated_at = ?
      WHERE username = ?
    `).bind(defaultPass, nowIso, defaultUser).run();
    await env.DB.prepare("UPDATE punishments SET created_by = ? WHERE created_by_username = ?").bind("Desenvolvedor", defaultUser).run();
  }

  const user = await env.DB.prepare(`SELECT id, username, password, nickname, server, role_level, blocked, is_super
    FROM users WHERE username = ?`).bind(username).first();

  if (!user || user.password !== password) return json({ error: "Usuário ou senha incorretos." }, 401);
  if (Number(user.blocked) === 1) return json({ error: "Seu acesso está bloqueado." }, 403);

  const token = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24 * 7;
  await env.DB.prepare("INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(token, username, now, expiresAt).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();

  return json({ token, expiresAt, user: {
    username: user.username,
    nickname: user.nickname,
    server: user.server,
    roleLevel: Number(user.role_level),
    roleName: roleName(user.role_level),
    isSuper: Number(user.is_super) === 1,
    canManageUsers: Number(user.is_super) === 1 || Number(user.role_level) >= 2,
    canManageGoals: Number(user.is_super) === 1 || Number(user.role_level) >= 2
  }});
}
