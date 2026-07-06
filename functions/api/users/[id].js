function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function clean(value, max = 5000) { return String(value ?? "").trim().slice(0, max); }
function canManage(user) { return Number(user.is_super) === 1 || Number(user.role_level) >= 2; }
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
export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const actor = await requireAuth(request, env);
  if (!actor || !canManage(actor)) return json({ error: "Acesso não autorizado." }, 403);
  const target = await env.DB.prepare("SELECT id, username, is_super FROM users WHERE id = ?").bind(params.id).first();
  if (!target) return json({ error: "Usuário não encontrado." }, 404);
  const body = await readJson(request);
  const fields = [];
  const values = [];
  if (body.username !== undefined) { const v = clean(body.username, 80); if (!v) return json({ error: "Usuário não pode ficar vazio." }, 400); fields.push("username = ?"); values.push(v); }
  if (body.password !== undefined && String(body.password) !== "") { fields.push("password = ?"); values.push(String(body.password)); }
  if (body.nickname !== undefined) { const v = clean(body.nickname, 120); if (!v) return json({ error: "Nickname não pode ficar vazio." }, 400); fields.push("nickname = ?"); values.push(v); }
  if (body.server !== undefined) { fields.push("server = ?"); values.push(clean(body.server || "39", 20) || "39"); }
  if (body.blocked !== undefined && Number(target.is_super) !== 1) { fields.push("blocked = ?"); values.push(body.blocked ? 1 : 0); }
  if (!fields.length) return json({ ok: true });
  fields.push("updated_at = ?"); values.push(new Date().toISOString()); values.push(params.id);
  await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}
