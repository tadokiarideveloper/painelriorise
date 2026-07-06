function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return json({ error: "Banco D1 não configurado." }, 500);

  const record = await env.DB.prepare(
    `SELECT id, type, player_name, punishment_time, reason, observation, article, server,
            occurred_date, evidence_url, created_by, created_at, updated_at
       FROM punishments WHERE id = ?`
  ).bind(params.id).first();

  if (!record) return json({ error: "Registro não encontrado." }, 404);
  return json({ record });
}
