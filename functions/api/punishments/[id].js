function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function clean(value, max = 5000) { return String(value ?? "").trim().slice(0, max); }
function normalizeDate(value) { const date = clean(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10); }
function normalizeUrl(value) { const url = clean(value, 2048); if (!url) return ""; return /^https?:\/\//i.test(url) ? url : `https://${url}`; }
function canManage(user) { return Number(user.is_super) === 1 || Number(user.role_level) >= 2; }
function canDelete(user) { return Number(user.is_super) === 1 || Number(user.role_level) >= 3; }
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
const ALLOWED_TYPES = new Set(["Ban", "Jail", "Mute", "Mute Report", "Kick", "Solicitação de Ban", "Solicitação de Prisão"]);
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);
  const record = await env.DB.prepare(`SELECT id, type, player_name, punishment_time, reason, observation, article, server, occurred_date, evidence_url, created_by, created_by_username, created_at, updated_at FROM punishments WHERE id = ?`).bind(params.id).first();
  if (!record) return json({ error: "Registro não encontrado." }, 404);
  if (!canManage(user) && record.created_by_username && record.created_by_username !== user.username) return json({ error: "Acesso não autorizado." }, 403);
  return json({ record });
}
export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);
  const current = await env.DB.prepare("SELECT id, created_by_username FROM punishments WHERE id = ?").bind(params.id).first();
  if (!current) return json({ error: "Registro não encontrado." }, 404);
  if (!canManage(user) && current.created_by_username && current.created_by_username !== user.username) return json({ error: "Acesso não autorizado." }, 403);
  const body = await readJson(request);
  const type = clean(body.type, 80);
  if (!ALLOWED_TYPES.has(type)) return json({ error: "Tipo de punição inválido." }, 400);
  await env.DB.prepare(`UPDATE punishments SET type = ?, player_name = ?, punishment_time = ?, reason = ?, observation = ?, article = ?, server = ?, occurred_date = ?, evidence_url = ?, updated_at = ? WHERE id = ?`)
    .bind(type, clean(body.playerName, 160), clean(body.time, 120), clean(body.reason, 5000), clean(body.observation, 5000), clean(body.article, 120), clean(body.server || "39", 20) || "39", normalizeDate(body.occurredDate), normalizeUrl(body.evidenceUrl), new Date().toISOString(), params.id).run();
  const record = await env.DB.prepare(`SELECT id, type, player_name, punishment_time, reason, observation, article, server, occurred_date, evidence_url, created_by, created_by_username, created_at, updated_at FROM punishments WHERE id = ?`).bind(params.id).first();
  return json({ record });
}
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);
  const current = await env.DB.prepare("SELECT id, created_by_username FROM punishments WHERE id = ?").bind(params.id).first();
  if (!current) return json({ error: "Registro não encontrado." }, 404);
  if (!canDelete(user)) return json({ error: "Somente Desenvolvedor pode excluir registros." }, 403);
  await env.DB.prepare("DELETE FROM punishments WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
