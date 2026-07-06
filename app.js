const TOKEN_KEY = "rioRise.cloudflare.token.v2";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let records = [];
let users = [];
let currentUser = null;
let settings = { monthlyGoal: 30 };
let lastSavedId = null;

const TYPES = ["Ban", "Jail", "Mute", "Mute Report", "Kick", "Solicitação de Ban", "Solicitação de Prisão"];

const api = {
  async request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!res.ok) {
      if (res.status === 401) { sessionStorage.removeItem(TOKEN_KEY); showLogin(); }
      throw new Error(data?.error || data?.message || "Erro na comunicação com o servidor.");
    }
    return data;
  },
  login(username, password) { return this.request("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }); },
  session() { return this.request("/api/session"); },
  listPunishments() { return this.request("/api/punishments"); },
  createPunishment(payload) { return this.request("/api/punishments", { method: "POST", body: JSON.stringify(payload) }); },
  getPublicPunishment(id) { return this.request(`/api/public/${encodeURIComponent(id)}`, { headers: {} }); },
  getSettings() { return this.request("/api/settings"); },
  saveSettings(payload) { return this.request("/api/settings", { method: "PUT", body: JSON.stringify(payload) }); },
  listUsers() { return this.request("/api/users"); },
  createUser(payload) { return this.request("/api/users", { method: "POST", body: JSON.stringify(payload) }); },
  updateUser(id, payload) { return this.request(`/api/users/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }); }
};

function init() {
  setDefaultDate();
  bindEvents();
  window.addEventListener("hashchange", handleRoute);
  setTimeout(() => { $("#loader").classList.add("fade-out"); setTimeout(() => $("#loader").classList.add("hidden"), 560); handleRoute(); }, 700);
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); currentUser = null; showLogin(); });
  $$(".nav-link").forEach(btn => btn.addEventListener("click", () => activateSection(btn.dataset.target)));
  $("#punishmentForm").addEventListener("submit", handlePunishmentSubmit);
  $("#punishmentForm").addEventListener("reset", () => setTimeout(setDefaultDate, 0));
  $("#copyLastLinkBtn").addEventListener("click", () => { const r = records.find(x => x.id === lastSavedId); if (r) copyShareLink(r); });
  $("#searchInput").addEventListener("input", renderSearchResults);
  $("#clearSearchBtn").addEventListener("click", () => { $("#searchInput").value = ""; renderSearchResults(); });
  $("#exportBtn").addEventListener("click", exportSpreadsheet);
  $("#refreshBtn")?.addEventListener("click", () => loadAll(true));
  $("#refreshUsersBtn")?.addEventListener("click", () => loadUsers(true));
  $("#adminUserForm")?.addEventListener("submit", handleCreateAdmin);
  $("#goalInput").addEventListener("change", saveGoal);
  $("#detailModal").addEventListener("click", e => { if (e.target.dataset.close === "modal") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

async function handleRoute() {
  const publicId = getPublicIdFromHash();
  if (publicId) return renderPublicView(publicId);
  $("#publicView").classList.add("hidden");
  $("#app").classList.remove("hidden");
  if (!sessionStorage.getItem(TOKEN_KEY)) return showLogin();
  try {
    const s = await api.session();
    currentUser = s.user;
    await showDashboard();
  } catch { showLogin(); }
}

async function handleLogin(e) {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    const data = await api.login($("#loginUser").value.trim(), $("#loginPass").value);
    sessionStorage.setItem(TOKEN_KEY, data.token);
    currentUser = data.user;
    $("#loginForm").reset();
    await showDashboard();
  } catch (err) { $("#loginError").textContent = err.message || "Usuário ou senha incorretos."; }
}

function showLogin() {
  $("#publicView").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#loginScreen").classList.remove("hidden");
  $("#dashboard").classList.add("hidden");
}

async function showDashboard() {
  $("#loginScreen").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  applyRoleUI();
  activateSection("overview");
  await loadAll(false);
}

function applyRoleUI() {
  const canManage = !!currentUser?.canManageUsers;
  const canGoals = !!currentUser?.canManageGoals;
  $("#usersNavBtn")?.classList.toggle("admin-only-hidden", !canManage);
  const brandSpan = $(".brand span"); if (brandSpan) brandSpan.textContent = currentUser?.nickname || "Admin Kiari";
  const goalBox = $(".goal-input"); if (goalBox) goalBox.classList.toggle("admin-only-hidden", !canGoals);
}

function activateSection(id) {
  if (id === "users" && !currentUser?.canManageUsers) id = "overview";
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.target === id));
  $$(".page-section").forEach(s => s.classList.toggle("active-section", s.id === id));
  if (id === "overview") renderDashboard();
  if (id === "search") renderSearchResults();
  if (id === "records") renderRecordsList();
  if (id === "users") loadUsers(false);
}

async function loadAll(showMessage = false) {
  try {
    const [pun, set] = await Promise.all([api.listPunishments(), api.getSettings().catch(() => ({ monthlyGoal: 30 }))]);
    records = (pun.records || []).map(fromApiRecord);
    settings.monthlyGoal = Number(set.monthlyGoal || 30);
    $("#goalInput").value = settings.monthlyGoal;
    renderAll();
    if (currentUser?.canManageUsers) loadUsers(false);
    if (showMessage) showToast("Banco atualizado.");
  } catch (err) { showToast(err.message || "Não foi possível carregar o banco."); }
}

async function saveGoal() {
  if (!currentUser?.canManageGoals) return;
  const monthlyGoal = Math.max(1, Number($("#goalInput").value) || 30);
  try { const data = await api.saveSettings({ monthlyGoal }); settings.monthlyGoal = data.monthlyGoal; renderDashboard(); showToast("Meta atualizada."); }
  catch (err) { showToast(err.message || "Não foi possível salvar a meta."); }
}

function setDefaultDate() {
  if ($("#occurredDate") && !$("#occurredDate").value) $("#occurredDate").value = new Date().toISOString().slice(0, 10);
  if ($("#server") && !$("#server").value) $("#server").value = "39";
  if ($("#newAdminServer") && !$("#newAdminServer").value) $("#newAdminServer").value = "39";
}

async function handlePunishmentSubmit(e) {
  e.preventDefault();
  const payload = {
    type: $("#punishmentType").value,
    playerName: $("#playerName").value.trim(),
    time: $("#punishmentTime").value.trim(),
    reason: $("#reason").value.trim(),
    observation: $("#observation").value.trim(),
    article: $("#article").value.trim(),
    server: $("#server").value.trim() || "39",
    occurredDate: $("#occurredDate").value,
    evidenceUrl: normalizeUrl($("#evidenceUrl").value.trim())
  };
  try {
    const data = await api.createPunishment(payload);
    const record = fromApiRecord(data.record);
    records.unshift(record);
    lastSavedId = record.id;
    $("#copyLastLinkBtn").disabled = false;
    $("#punishmentForm").reset(); setDefaultDate(); renderAll();
    showToast("Registro salvo e enviado ao Discord."); openDetail(record.id);
  } catch (err) { showToast(err.message || "Não foi possível salvar."); }
}

async function handleCreateAdmin(e) {
  e.preventDefault();
  const payload = {
    username: $("#newAdminUsername").value.trim(),
    password: $("#newAdminPassword").value,
    nickname: $("#newAdminNickname").value.trim(),
    server: $("#newAdminServer").value.trim() || "39"
  };
  try { await api.createUser(payload); $("#adminUserForm").reset(); setDefaultDate(); await loadUsers(true); showToast("Admin cadastrado."); }
  catch (err) { showToast(err.message || "Não foi possível cadastrar."); }
}

async function loadUsers(showMessage = false) {
  if (!currentUser?.canManageUsers) return;
  try { const data = await api.listUsers(); users = data.users || []; renderUsers(); if (showMessage) showToast("Usuários atualizados."); }
  catch (err) { showToast(err.message || "Não foi possível carregar usuários."); }
}

function renderUsers() {
  const box = $("#usersList"); if (!box) return;
  if (!users.length) { box.className = "records-list empty-state"; box.textContent = "Nenhum usuário cadastrado."; return; }
  box.className = "records-list";
  box.innerHTML = users.map(u => `
    <article class="user-card">
      <header>
        <div><strong>${escapeHtml(u.nickname)}</strong><small>@${escapeHtml(u.username)} • Servidor ${escapeHtml(u.server || "39")}</small></div>
        <span class="role-pill">${escapeHtml(u.role_name || "Admin")} (${Number(u.role_level) || 1})</span>
      </header>
      ${Number(u.blocked) === 1 ? '<span class="blocked-pill">Bloqueado</span>' : ''}
      <small>${Number(u.punishment_count || 0)} punições aplicadas</small>
      <div class="user-actions">
        <button class="ghost-btn" type="button" data-user-action="edit" data-id="${escapeAttr(u.id)}">Alterar usuário/senha</button>
        <button class="soft-btn" type="button" data-user-action="toggle" data-id="${escapeAttr(u.id)}">${Number(u.blocked) === 1 ? 'Desbloquear' : 'Bloquear'}</button>
        <button class="primary-btn" type="button" data-user-action="punishments" data-username="${escapeAttr(u.username)}">Ver punições</button>
      </div>
    </article>`).join("");
  $$('[data-user-action]', box).forEach(btn => btn.addEventListener('click', handleUserAction));
}

async function handleUserAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.userAction;
  if (action === "punishments") {
    const username = btn.dataset.username;
    const filtered = records.filter(r => r.createdByUsername === username || r.createdBy === username);
    const container = document.createElement("div");
    container.innerHTML = `<div class="detail-header"><img src="assets/logo-rio-rise.jpg" alt="Rio Rise"><div><span class="eyebrow">Punições do admin</span><h2>${escapeHtml(username)}</h2></div></div><div id="tempRecords" class="records-list"></div>`;
    $("#modalContent").innerHTML = ""; $("#modalContent").appendChild(container); renderRecordButtons($("#tempRecords"), filtered, "Nenhuma punição encontrada para esse admin."); $("#detailModal").classList.remove("hidden"); return;
  }
  const user = users.find(u => u.id === btn.dataset.id); if (!user) return;
  if (action === "toggle") {
    if (Number(user.is_super) === 1) return showToast("Esse usuário principal não pode ser bloqueado.");
    try { await api.updateUser(user.id, { blocked: Number(user.blocked) !== 1 }); await loadUsers(true); } catch (err) { showToast(err.message); }
  }
  if (action === "edit") {
    const username = prompt("Novo usuário de login:", user.username); if (username === null) return;
    const nickname = prompt("Novo nickname administrativo:", user.nickname); if (nickname === null) return;
    const server = prompt("Servidor:", user.server || "39"); if (server === null) return;
    const password = prompt("Nova senha (deixe vazio para manter):", "");
    try { await api.updateUser(user.id, { username, nickname, server, password }); await loadUsers(true); showToast("Usuário atualizado."); }
    catch (err) { showToast(err.message || "Não foi possível atualizar."); }
  }
}

function fromApiRecord(r) {
  return { id: r.id, type: r.type, playerName: r.player_name, time: r.punishment_time, reason: r.reason, observation: r.observation, article: r.article, server: r.server || "39", occurredDate: r.occurred_date, evidenceUrl: r.evidence_url, createdBy: r.created_by || "Admin Kiari", createdByUsername: r.created_by_username || "", createdAt: r.created_at };
}
function renderAll() { renderDashboard(); renderSearchResults(); renderRecordsList(); }
function renderDashboard() {
  const monthRecords = getCurrentMonthRecords(); const goal = Number(settings.monthlyGoal) || 30; const percent = Math.min(100, Math.round((monthRecords.length / goal) * 100));
  $("#monthCount").textContent = monthRecords.length; $("#totalCount").textContent = records.length; $("#banCount").textContent = records.filter(r => (r.type || "").toLowerCase().includes("ban")).length;
  $("#progressPercent").textContent = `${percent}%`; $("#progressText").textContent = `${monthRecords.length} de ${goal} registros`; $("#progressCircle").style.background = `conic-gradient(var(--purple-2) ${percent * 3.6}deg, rgba(255,255,255,0.1) 0deg)`;
  renderRecentList(); drawTypeChart(); drawDailyChart();
}
function renderRecentList() {
  const list = $("#recentList"), recent = records.slice(0, 5); if (!recent.length) { list.className = "recent-list empty-state"; list.textContent = "Nenhum registro ainda."; return; }
  list.className = "recent-list"; list.innerHTML = recent.map(r => `<button class="mini-record record-item" data-id="${escapeAttr(r.id)}" type="button"><span><strong>${escapeHtml(r.playerName)}</strong><br>${escapeHtml(r.type)} • ${formatDate(r.occurredDate)}</span></button>`).join("");
  $$(".mini-record", list).forEach(b => b.addEventListener("click", () => openDetail(b.dataset.id)));
}
function renderSearchResults() { const q = ($("#searchInput")?.value || "").trim().toLowerCase(); const c = $("#searchResults"); if (!q) { c.className = "records-list empty-state"; c.textContent = "Nenhum jogador pesquisado."; return; } renderRecordButtons(c, records.filter(r => (r.playerName || "").toLowerCase().includes(q)), "Nenhum registro encontrado para esse jogador."); }
function renderRecordsList() { renderRecordButtons($("#recordsList"), records, "Nenhum registro salvo no banco."); }
function renderRecordButtons(container, items, emptyText) {
  if (!container) return; if (!items.length) { container.className = "records-list empty-state"; container.textContent = emptyText; return; }
  container.className = "records-list"; container.innerHTML = items.map(r => `<button class="record-item" data-id="${escapeAttr(r.id)}" type="button"><span class="record-main"><strong>${escapeHtml(r.playerName)}</strong><span>${escapeHtml(r.type)} • ${formatDate(r.occurredDate)} • ${escapeHtml(r.createdBy)}</span></span><span class="record-side">Servidor ${escapeHtml(r.server)}</span></button>`).join("");
  $$(".record-item", container).forEach(b => b.addEventListener("click", () => openDetail(b.dataset.id)));
}
function openDetail(id) { const r = records.find(x => x.id === id); if (!r) return; $("#modalContent").innerHTML = detailHtml(r); $("#detailModal").classList.remove("hidden"); $("#copyLinkBtn")?.addEventListener("click", () => copyShareLink(r)); }
function closeModal() { $("#detailModal").classList.add("hidden"); }
function detailHtml(r) { return `<div class="detail-header"><img src="assets/logo-rio-rise.jpg" alt="Rio Rise"><div><span class="eyebrow">Rio Rise • Servidor ${escapeHtml(r.server)}</span><h2 id="modalTitle">Ficha de punição</h2></div></div>${recordGridHtml(r)}<div class="detail-actions"><button id="copyLinkBtn" class="primary-btn" type="button">Copiar link da ficha</button>${r.evidenceUrl ? `<a class="ghost-btn" href="${escapeAttr(normalizeUrl(r.evidenceUrl))}" target="_blank" rel="noopener">Abrir evidência</a>` : ""}</div>`; }
function recordGridHtml(r) { const ev = normalizeUrl(r.evidenceUrl || ""); return `<div class="detail-grid"><div class="meta-value"><small>Nome do jogador</small><p>${escapeHtml(r.playerName)}</p></div><div class="meta-value"><small>Tipo de punição</small><p>${escapeHtml(r.type)}</p></div><div class="meta-value"><small>Tempo</small><p>${escapeHtml(r.time)}</p></div><div class="meta-value"><small>Servidor</small><p>${escapeHtml(r.server)}</p></div><div class="meta-value"><small>Data do ocorrido</small><p>${formatDate(r.occurredDate)}</p></div><div class="meta-value"><small>Artigo</small><p>${escapeHtml(r.article)}</p></div><div class="meta-value"><small>Registrado por</small><p>${escapeHtml(r.createdBy)}</p></div><div class="meta-value"><small>Criado em</small><p>${formatDateTime(r.createdAt)}</p></div><div class="meta-value wide"><small>Motivo</small><p>${escapeHtml(r.reason)}</p></div><div class="meta-value wide"><small>Observação</small><p>${escapeHtml(r.observation || "Sem observação.")}</p></div><div class="meta-value wide"><small>Evidência</small>${ev ? `<p class="evidence-link-wrap"><a class="evidence-link" href="${escapeAttr(ev)}" target="_blank" rel="noopener">${escapeHtml(ev)}</a></p>` : `<p>Nenhum link de evidência foi informado.</p>`}</div></div>`; }
async function renderPublicView(id) { $("#app").classList.add("hidden"); const box = $("#publicView"); box.classList.remove("hidden"); box.innerHTML = `<article class="public-card"><p class="public-note">Carregando ficha...</p></article>`; try { const data = await api.getPublicPunishment(id); const r = fromApiRecord(data.record); box.innerHTML = `<article class="public-card"><div class="public-header"><img src="assets/logo-rio-rise.jpg" alt="Rio Rise"><div><span class="eyebrow">Rio Rise • Servidor ${escapeHtml(r.server)}</span><h1>Ficha de punição</h1></div></div>${recordGridHtml(r)}</article>`; } catch { box.innerHTML = `<article class="public-card"><div class="public-header"><img src="assets/logo-rio-rise.jpg" alt="Rio Rise"><div><span class="eyebrow">Rio Rise</span><h1>Ficha não encontrada</h1></div></div></article>`; } }
function getPublicIdFromHash() { const m = location.hash.match(/ficha=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; }
function copyShareLink(r) { copyText(`${location.href.split("#")[0]}#ficha=${encodeURIComponent(r.id)}`).then(() => showToast("Link da ficha copiado.")); }

function drawTypeChart() { const canvas = $("#typeChart"); if (!canvas) return; const ctx = canvas.getContext("2d"), w = canvas.clientWidth || 680, h = canvas.clientHeight || 320, dpr = devicePixelRatio || 1; canvas.width = w*dpr; canvas.height = h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h); const sum = getTypeSummary(), vals = TYPES.map(t => sum[t] || 0), max = Math.max(1,...vals), pad=30, gap=8, bw=Math.max(16,(w-pad*2-gap*(TYPES.length-1))/TYPES.length); ctx.font="12px system-ui"; TYPES.forEach((t,i)=>{ const v=vals[i], bh=Math.max(5,(h-96)*v/max), x=pad+i*(bw+gap), y=h-54-bh; ctx.fillStyle="rgba(159,144,255,.9)"; roundRect(ctx,x,y,bw,bh,10); ctx.fill(); ctx.fillStyle="rgba(255,255,255,.88)"; ctx.fillText(String(v),x+bw/2-4,y-8); ctx.save(); ctx.translate(x+bw/2,h-40); ctx.rotate(-.45); ctx.textAlign="right"; ctx.fillStyle="rgba(255,255,255,.66)"; ctx.fillText(t,0,0); ctx.restore(); }); }
function drawDailyChart() { const canvas=$("#dailyChart"); if(!canvas) return; const ctx=canvas.getContext("2d"), w=canvas.clientWidth||680, h=canvas.clientHeight||320, dpr=devicePixelRatio||1; canvas.width=w*dpr; canvas.height=h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h); const days=Array.from({length:7},(_,i)=>{const d=new Date(); d.setDate(d.getDate()-(6-i)); return d}); const vals=days.map(d=>records.filter(r=>sameDay(new Date(r.createdAt),d)).length), max=Math.max(1,...vals), pad=36, step=(w-pad*2)/6; ctx.strokeStyle="rgba(159,144,255,.96)"; ctx.lineWidth=4; ctx.beginPath(); vals.forEach((v,i)=>{ const x=pad+step*i, y=h-54-((h-96)*v/max); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke(); vals.forEach((v,i)=>{ const x=pad+step*i,y=h-54-((h-96)*v/max); ctx.fillStyle="rgba(113,61,244,.9)"; ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle="rgba(255,255,255,.85)"; ctx.textAlign="center"; ctx.fillText(String(v),x,y-12); ctx.fillText(days[i].toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),x,h-30); }); }
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function getCurrentMonthRecords(){ const now=new Date(); return records.filter(r=>{const d=new Date(r.createdAt); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}); }
function getTypeSummary(){ const s={}; records.forEach(r=>s[r.type||"Sem tipo"]=(s[r.type||"Sem tipo"]||0)+1); return s; }
function getOrderedTypeSummary(){ return Object.entries(getTypeSummary()).map(([type,count])=>({type,count})).sort((a,b)=>b.count-a.count||a.type.localeCompare(b.type)); }
function getPlayerSummary(){ const m=new Map(); records.forEach(r=>{const name=r.playerName||"Sem nome", cur=m.get(name)||{playerName:name,count:0,lastCreatedAt:r.createdAt}; cur.count++; if(new Date(r.createdAt)>new Date(cur.lastCreatedAt)) cur.lastCreatedAt=r.createdAt; m.set(name,cur);}); return [...m.values()].sort((a,b)=>b.count-a.count||a.playerName.localeCompare(b.playerName)); }
function exportSpreadsheet(){ if(!window.XLSX) return showToast("Biblioteca de planilha não carregou."); const base=location.href.split("#")[0]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Backup Rio Rise - Servidor 39"],[],["Exportado em",new Date().toLocaleString("pt-BR")],["Total de registros",records.length],["Punições no mês",getCurrentMonthRecords().length],["Meta mensal",settings.monthlyGoal],["Usuário",currentUser?.nickname||""]]),"Resumo"); const rows=records.map((r,i)=>({"Nº":i+1,"ID":r.id,"Tipo de punição":r.type,"Nome do jogador":r.playerName,"Tempo":r.time,"Motivo":r.reason,"Observação":r.observation||"Sem observação.","Artigo":r.article,"Servidor":r.server,"Data do ocorrido":formatDate(r.occurredDate),"Link da evidência":normalizeUrl(r.evidenceUrl||""),"Link da ficha":`${base}#ficha=${encodeURIComponent(r.id)}`,"Registrado por":r.createdBy,"Usuário interno":r.createdByUsername,"Criado em":formatDateTime(r.createdAt)})); const ws=XLSX.utils.json_to_sheet(rows); ws["!autofilter"]={ref:XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"]||"A1:O1"))}; XLSX.utils.book_append_sheet(wb,ws,"Registros"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(getOrderedTypeSummary()),"Resumo por Tipo"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(getPlayerSummary()),"Resumo por Jogador"); XLSX.writeFile(wb,`backup-rio-rise-servidor-39-${new Date().toISOString().slice(0,10)}.xlsx`); }
function normalizeUrl(v){ const url=String(v||"").trim(); if(!url) return ""; return /^https?:\/\//i.test(url)?url:`https://${url}`; }
async function copyText(text){ if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text); const t=document.createElement("textarea"); t.value=text; t.style.position="fixed"; t.style.opacity="0"; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
function showToast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden"); clearTimeout(showToast.timeout); showToast.timeout=setTimeout(()=>t.classList.add("hidden"),3000); }
function formatDate(v){ if(!v) return "—"; const [y,m,d]=v.slice(0,10).split("-"); return y&&m&&d?`${d}/${m}/${y}`:v; }
function formatDateTime(v){ if(!v) return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?v:d.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}); }
function escapeHtml(v){ return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function escapeAttr(v){ return escapeHtml(v).replaceAll("`","&#096;"); }
init();
