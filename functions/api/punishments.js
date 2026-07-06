const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1521766562695086130/6LkAovOVT5qeZvr-iR0xFpET_MvPwN8Tk_1rbhoxfwue40IokA6JeVHuoY0z1TzFfvql";

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function clean(value, max = 5000) { return String(value ?? "").trim().slice(0, max); }
function normalizeDate(value) { const date = clean(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10); }
function normalizeUrl(value) { const url = clean(value, 2048); if (!url) return ""; return /^https?:\/\//i.test(url) ? url : `https://${url}`; }
function roleName(level) { return Number(level) === 3 ? "Desenvolvedor" : Number(level) === 2 ? "Líder" : "Admin"; }
function canManage(user) { return Number(user.is_super) === 1 || Number(user.role_level) >= 2; }
async function ensureSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS punishments (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, player_name TEXT NOT NULL, punishment_time TEXT NOT NULL,
    reason TEXT NOT NULL, observation TEXT, article TEXT NOT NULL, server TEXT NOT NULL DEFAULT '39',
    occurred_date TEXT NOT NULL, evidence_url TEXT, created_by TEXT NOT NULL DEFAULT 'Admin Kiari',
    created_by_username TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_punishments_player_name ON punishments(player_name)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_punishments_created_by_username ON punishments(created_by_username)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_punishments_created_at ON punishments(created_at)`).run();
  try { await env.DB.prepare(`ALTER TABLE punishments ADD COLUMN created_by_username TEXT`).run(); } catch {}
}
async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const session = await env.DB.prepare("SELECT username, expires_at FROM sessions WHERE token = ?").bind(token).first();
  if (!session || Number(session.expires_at) < Date.now()) { if (session) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run(); return null; }
  const user = await env.DB.prepare("SELECT id, username, nickname, server, role_level, blocked, is_super FROM users WHERE username = ?").bind(session.username).first();
  if (!user || Number(user.blocked) === 1) return null;
  return user;
}
const ALLOWED_TYPES = new Set(["Ban", "Jail", "Mute", "Mute Report", "Kick", "Solicitação de Ban", "Solicitação de Prisão"]);

async function sendDiscord(record, actor, request) {
  try {
    const origin = new URL(request.url).origin;
    const ficha = `${origin}/#ficha=${encodeURIComponent(record.id)}`;
    const title = record.type.toLowerCase().includes("solicitação") ? "Nova solicitação registrada" : "Nova punição registrada";
    const fields = [
      { name: "Tipo", value: record.type || "—", inline: true },
      { name: "Jogador", value: record.player_name || "—", inline: true },
      { name: "Tempo", value: record.punishment_time || "—", inline: true },
      { name: "Servidor", value: record.server || "39", inline: true },
      { name: "Artigo", value: record.article || "—", inline: true },
      { name: "Data do ocorrido", value: record.occurred_date || "—", inline: true },
      { name: "Registrado por", value: `${actor.nickname || actor.username} (${roleName(actor.role_level)} ${actor.role_level})`, inline: false },
      { name: "Motivo", value: (record.reason || "—").slice(0, 1024), inline: false },
      { name: "Observação", value: (record.observation || "Sem observação.").slice(0, 1024), inline: false },
      { name: "Evidência", value: record.evidence_url ? `[Abrir evidência](${record.evidence_url})` : "Não informado.", inline: false },
      { name: "Ficha", value: `[Abrir ficha](${ficha})`, inline: false }
    ];
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Rio Rise • Logs",
        avatar_url: `${origin}/assets/logo-rio-rise.jpg`,
        embeds: [{ title, color: 0x713df4, fields, timestamp: new Date().toISOString(), footer: { text: "Rio Rise • Servidor 39" } }]
      })
    });
  } catch {}
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  await ensureSchema(env);
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);

  let result;
  if (canManage(user)) {
    result = await env.DB.prepare(`SELECT id, type, player_name, punishment_time, reason, observation, article, server, occurred_date, evidence_url, created_by, created_by_username, created_at, updated_at FROM punishments ORDER BY datetime(created_at) DESC`).all();
  } else {
    result = await env.DB.prepare(`SELECT id, type, player_name, punishment_time, reason, observation, article, server, occurred_date, evidence_url, created_by, created_by_username, created_at, updated_at FROM punishments WHERE created_by_username = ? OR created_by = ? ORDER BY datetime(created_at) DESC`).bind(user.username, user.nickname).all();
  }
  return json({ records: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);
  await ensureSchema(env);
  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Acesso não autorizado." }, 401);

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
  await env.DB.prepare(`INSERT INTO punishments
    (id, type, player_name, punishment_time, reason, observation, article, server, occurred_date, evidence_url, created_by, created_by_username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, type, playerName, punishmentTime, reason, observation, article, server, occurredDate, evidenceUrl, user.nickname || user.username, user.username, nowIso, nowIso).run();

  const record = await env.DB.prepare(`SELECT id, type, player_name, punishment_time, reason, observation, article, server, occurred_date, evidence_url, created_by, created_by_username, created_at, updated_at FROM punishments WHERE id = ?`).bind(id).first();
  await sendDiscord(record, user, request);
  return json({ record }, 201);
}
