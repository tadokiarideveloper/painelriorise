function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado. Crie o binding DB no Cloudflare." }, 500);
  if (!env.ADMIN_USER || !env.ADMIN_PASS) {
    return json({ error: "Credenciais não configuradas. Defina ADMIN_USER e ADMIN_PASS nas variáveis do Cloudflare." }, 500);
  }

  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) {
    return json({ error: "Usuário ou senha incorretos." }, 401);
  }

  const token = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24 * 7;

  await env.DB.prepare(
    "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(token, username, now, expiresAt).run();

  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();

  return json({ token, expiresAt });
}
