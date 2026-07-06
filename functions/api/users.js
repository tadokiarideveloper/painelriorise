function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function clean(value, max = 5000) { return String(value ?? "").trim().slice(0, max); }
function roleName(level) { return Number(level) === 3 ? "Desenvolvedor" : Number(level) === 2 ? "Líder" : "Admin"; }
function canManage(user) { return Number(user.is_super) === 1 || Number(user.role_level) >= 2; }
async function ensureSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, nickname TEXT NOT NULL,
    server TEXT NOT NULL DEFAULT '39', role_level INTEGER NOT NULL DEFAULT 1, blocked INTEGER NOT NULL DEFAULT 0,
    is_super INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  try { await env.DB.prepare(`ALTER TABLE punishments ADD COLUMN created_by_username TEXT`).run(); } catch {}
}
async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const session = await env.DB.prepare("SELECT username, expires_at FROM sessions WHERE token = ?").bind(token).first();
  if (!session || Number(session.expires_at) < Date.now()) return null;
  const user = await env.DB.prepare("SELECT id, username, nickname, server, role_level, blocked, is_super FROM users WHERE username = ?").bind(session.username).first();
  if (!user || Number(user.blocked) === 1) return null;
  return user;
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  await ensureSchema(env);
  const actor = await requireAuth(request, env);
  if (!actor || !canManage(actor)) return json({ error: "Acesso não autorizado." }, 403);
  const result = await env.DB.prepare(`SELECT u.id, u.username, u.nickname, u.server, u.role_level, u.blocked, u.is_super, u.created_at, u.updated_at, COUNT(p.id) AS punishment_count
    FROM users u LEFT JOIN punishments p ON p.created_by_username = u.username
    GROUP BY u.id ORDER BY u.role_level DESC, u.nickname ASC`).all();
  const users = (result.results || []).map(u => ({ ...u, role_name: roleName(u.role_level), password: undefined }));
  return json({ users });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  await ensureSchema(env);
  const actor = await requireAuth(request, env);
  if (!actor || !canManage(actor)) return json({ error: "Acesso não autorizado." }, 403);
  const body = await readJson(request);
  const username = clean(body.username, 80);
  const password = String(body.password || "");
  const nickname = clean(body.nickname, 120);
  const server = clean(body.server || "39", 20) || "39";
  if (!username || !password || !nickname) return json({ error: "Preencha usuário, senha e nickname." }, 400);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (exists) return json({ error: "Esse usuário já existe." }, 400);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users (id, username, password, nickname, server, role_level, blocked, is_super, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`)
    .bind(id, username, password, nickname, server, now, now).run();
  return json({ ok: true, user: { id, username, nickname, server, role_level: 1, role_name: "Admin", blocked: 0, is_super: 0, punishment_count: 0 } }, 201);
}
