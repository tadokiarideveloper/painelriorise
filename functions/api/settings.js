function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function canManage(user) { return Number(user.is_super) === 1 || Number(user.role_level) >= 2; }
async function ensureSchema(env) { await env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).run(); }
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
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'monthlyGoal'").first();
  return json({ monthlyGoal: Number(row?.value || 30), canManageGoals: canManage(user) });
}
export async function onRequestPut({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  await ensureSchema(env);
  const user = await requireAuth(request, env);
  if (!user || !canManage(user)) return json({ error: "Acesso não autorizado." }, 403);
  const body = await readJson(request);
  const monthlyGoal = Math.max(1, Math.min(9999, Number(body.monthlyGoal) || 30));
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('monthlyGoal', ?, ?)").bind(String(monthlyGoal), new Date().toISOString()).run();
  return json({ monthlyGoal });
}
