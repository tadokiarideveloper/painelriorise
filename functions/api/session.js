function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
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
function roleName(level) { return Number(level) === 3 ? "Desenvolvedor" : Number(level) === 2 ? "Líder" : "Admin"; }
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);
  return json({ user: { username: user.username, nickname: user.nickname, server: user.server, roleLevel: Number(user.role_level), roleName: roleName(user.role_level), isSuper: Number(user.is_super) === 1, canManageUsers: Number(user.is_super) === 1 || Number(user.role_level) >= 2, canManageGoals: Number(user.is_super) === 1 || Number(user.role_level) >= 2 } });
}
