function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function clean(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function canManageUsers(user) {
  return Number(user.is_super) === 1 || Number(user.role_level) >= 2;
}

function canEditTarget(actor, target) {
  if (Number(actor.is_super) === 1) return true;
  const actorLevel = Number(actor.role_level || 1);
  const targetLevel = Number(target.role_level || 1);
  if (actorLevel >= 3) return true;
  if (actorLevel === 2) return targetLevel === 1;
  return false;
}

function canEditRole(actor, newRoleLevel) {
  const n = Number(newRoleLevel || 1);
  if (![1, 2, 3].includes(n)) return false;
  if (Number(actor.is_super) === 1) return true;
  return Number(actor.role_level || 1) >= 3;
}

async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const session = await env.DB.prepare("SELECT username, expires_at FROM sessions WHERE token = ?").bind(token).first();
  if (!session || Number(session.expires_at) < Date.now()) return null;

  const user = await env.DB.prepare(`
    SELECT id, username, nickname, server, role_level, blocked, is_super
    FROM users
    WHERE username = ?
  `).bind(session.username).first();

  if (!user || Number(user.blocked) === 1) return null;
  return user;
}

export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);

  const actor = await requireAuth(request, env);
  if (!actor || !canManageUsers(actor)) return json({ error: "Acesso não autorizado." }, 403);

  const target = await env.DB.prepare(`
    SELECT id, username, role_level, is_super
    FROM users
    WHERE id = ?
  `).bind(params.id).first();

  if (!target) return json({ error: "Usuário não encontrado." }, 404);
  if (!canEditTarget(actor, target)) return json({ error: "Você não tem permissão para alterar esse usuário." }, 403);

  const body = await readJson(request);
  const fields = [];
  const values = [];

  if (body.username !== undefined) {
    const username = clean(body.username, 80);
    if (!username) return json({ error: "Usuário não pode ficar vazio." }, 400);
    fields.push("username = ?");
    values.push(username);
  }

  if (body.password !== undefined && String(body.password) !== "") {
    fields.push("password = ?");
    values.push(String(body.password));
  }

  if (body.nickname !== undefined) {
    const nickname = clean(body.nickname, 120);
    if (!nickname) return json({ error: "Nickname não pode ficar vazio." }, 400);
    fields.push("nickname = ?");
    values.push(nickname);
  }

  if (body.server !== undefined) {
    fields.push("server = ?");
    values.push(clean(body.server || "39", 20) || "39");
  }

  if (body.roleLevel !== undefined) {
    const roleLevel = Number(body.roleLevel);
    if (!canEditRole(actor, roleLevel)) return json({ error: "Você não tem permissão para alterar esse cargo." }, 403);
    fields.push("role_level = ?");
    values.push(roleLevel);
  }

  if (body.blocked !== undefined) {
    if (Number(target.is_super) === 1) return json({ error: "Esse usuário principal não pode ser bloqueado." }, 403);
    fields.push("blocked = ?");
    values.push(body.blocked ? 1 : 0);
  }

  if (!fields.length) return json({ ok: true });

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(params.id);

  await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);

  const actor = await requireAuth(request, env);
  if (!actor) return json({ error: "Acesso não autorizado." }, 403);

  const actorIsDeveloper = Number(actor.is_super) === 1 || Number(actor.role_level || 1) >= 3;
  if (!actorIsDeveloper) {
    return json({ error: "Somente Desenvolvedor pode excluir usuários." }, 403);
  }

  const body = await readJson(request);
  const deletePassword = String(body.deletePassword || "");
  if (deletePassword !== "@pl@bm0v3l") {
    return json({ error: "Senha de exclusão incorreta." }, 403);
  }

  const target = await env.DB.prepare(`
    SELECT id, username, role_level, is_super
    FROM users
    WHERE id = ?
  `).bind(params.id).first();

  if (!target) return json({ error: "Usuário não encontrado." }, 404);

  if (Number(target.is_super) === 1) {
    return json({ error: "Esse usuário principal não pode ser excluído." }, 403);
  }

  if (String(target.username || "").toLowerCase() === String(actor.username || "").toLowerCase()) {
    return json({ error: "Você não pode excluir seu próprio usuário." }, 403);
  }

  await env.DB.prepare("DELETE FROM sessions WHERE username = ?").bind(target.username).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(params.id).run();

  return json({ ok: true });
}
