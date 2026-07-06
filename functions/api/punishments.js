function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const session = await env.DB.prepare(
    "SELECT username, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();

  if (!session || Number(session.expires_at) < Date.now()) {
    if (session) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }

  return session.username;
}

function clean(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeDate(value) {
  const date = clean(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
}

function normalizeUrl(value) {
  const url = clean(value, 2048);
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const ALLOWED_TYPES = new Set([
  "Ban",
  "Jail",
  "Mute",
  "Mute Report",
  "Kick",
  "Solicitação de Ban",
  "Solicitação de Kick"
]);

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const username = await requireAuth(request, env);
  if (!username) return json({ error: "Acesso não autorizado." }, 401);

  const result = await env.DB.prepare(
    `SELECT id, type, player_name, punishment_time, reason, observation, article, server,
            occurred_date, evidence_url, created_by, created_at, updated_at
       FROM punishments
      ORDER BY datetime(created_at) DESC`
  ).all();

  return json({ records: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  const username = await requireAuth(request, env);
  if (!username) return json({ error: "Acesso não autorizado." }, 401);

  const body = await readJson(request);
  const type = clean(body.type, 80);
  const playerName = clean(body.playerName, 160);
  const punishmentTime = clean(body.time, 120);
  const reason = clean(body.reason, 5000);
  const observation = clean(body.observation, 5000);
  const article = clean(body.article, 120);
  const server = clean(body.server || "39", 20) || "39";
  const occurredDate = normalizeDate(body.occurredDate);
  const evidenceUrl = normalizeUrl(body.evidenceUrl);

  if (!ALLOWED_TYPES.has(type)) return json({ error: "Tipo de punição inválido." }, 400);
  if (!playerName) return json({ error: "Informe o nome do jogador." }, 400);
  if (!punishmentTime) return json({ error: "Informe o tempo." }, 400);
  if (!reason) return json({ error: "Informe o motivo." }, 400);
  if (!article) return json({ error: "Informe o artigo." }, 400);

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const createdBy = "Admin Kiari";

  await env.DB.prepare(
    `INSERT INTO punishments
      (id, type, player_name, punishment_time, reason, observation, article, server,
       occurred_date, evidence_url, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, type, playerName, punishmentTime, reason, observation, article, server,
    occurredDate, evidenceUrl, createdBy, nowIso, nowIso
  ).run();

  const record = await env.DB.prepare(
    `SELECT id, type, player_name, punishment_time, reason, observation, article, server,
            occurred_date, evidence_url, created_by, created_at, updated_at
       FROM punishments WHERE id = ?`
  ).bind(id).first();

  return json({ record }, 201);
}
