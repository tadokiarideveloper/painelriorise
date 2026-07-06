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
  deletePunishment(id) { return this.request(`/api/punishments/${encodeURIComponent(id)}`, { method: "DELETE" }); },
  getPublicPunishment(id) { return this.request(`/api/public/${encodeURIComponent(id)}`, { headers: {} }); },
  getSettings() { return this.request("/api/settings"); },
  saveSettings(payload) { return this.request("/api/settings", { method: "PUT", body: JSON.stringify(payload) }); },
  listUsers() { return this.request("/api/users"); },
  createUser(payload) { return this.request("/api/users", { method: "POST", body: JSON.stringify(payload) }); },
  updateUser(id, payload) { return this.request(`/api/users/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }); },
  deleteUser(id, payload) { return this.request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify(payload) }); }
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
  $("#exportBtn")?.addEventListener("click", exportSpreadsheet);
  $("#exportFullLogBtn")?.addEventListener("click", chooseServersForFullLog);
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
  const canExport = Number(currentUser?.roleLevel || 1) >= 2 || currentUser?.isSuper;
  $("#usersNavBtn")?.classList.toggle("admin-only-hidden", !canManage);

  const brandSpan = $(".brand span");
  if (brandSpan) brandSpan.textContent = currentUser?.nickname || "Desenvolvedor";

  const goalBox = $(".goal-input");
  if (goalBox) goalBox.classList.toggle("admin-only-hidden", !canGoals);

  $$(".export-only").forEach(el => el.classList.toggle("admin-only-hidden", !canExport));

  const serverInput = $("#server");
  if (serverInput) {
    const isAdminOnly = Number(currentUser?.roleLevel || 1) < 2 && !currentUser?.isSuper;
    if (isAdminOnly) {
      serverInput.value = currentUser?.server || "39";
      serverInput.readOnly = true;
      serverInput.classList.add("readonly-input");
      serverInput.title = "Servidor fixo do seu usuário administrativo";
    } else {
      serverInput.readOnly = false;
      serverInput.classList.remove("readonly-input");
      serverInput.title = "";
    }
  }

  const roleSelect = $("#newAdminRole");
  if (roleSelect) {
    const isDeveloper = Number(currentUser?.roleLevel || 1) >= 3 || currentUser?.isSuper;
    roleSelect.innerHTML = isDeveloper
      ? `<option value="1">Admin (1)</option><option value="2">Líder (2)</option><option value="3">Desenvolvedor (3)</option>`
      : `<option value="1">Admin (1)</option>`;
  }
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
  if ($("#server")) {
    const isAdminOnly = currentUser && Number(currentUser?.roleLevel || 1) < 2 && !currentUser?.isSuper;
    if (isAdminOnly) $("#server").value = currentUser?.server || "39";
    else if (!$("#server").value) $("#server").value = "39";
  }
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
    server: (Number(currentUser?.roleLevel || 1) < 2 && !currentUser?.isSuper)
      ? (currentUser?.server || "39")
      : ($("#server").value.trim() || "39"),
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

  if (!currentUser?.canManageUsers) {
    showToast("Você não tem permissão para cadastrar usuários.");
    return;
  }

  const payload = {
    username: $("#newAdminUsername").value.trim(),
    password: $("#newAdminPassword").value,
    nickname: $("#newAdminNickname").value.trim(),
    server: $("#newAdminServer").value.trim() || "39",
    roleLevel: Number($("#newAdminRole")?.value || 1)
  };

  try {
    await api.createUser(payload);
    $("#adminUserForm").reset();
    setDefaultDate();
    if ($("#newAdminRole")) $("#newAdminRole").value = "1";
    await loadUsers(true);
    showToast("Usuário cadastrado.");
  } catch (err) {
    showToast(err.message || "Não foi possível cadastrar.");
  }
}

async function loadUsers(showMessage = false) {
  if (!currentUser?.canManageUsers) return;
  try { const data = await api.listUsers(); users = data.users || []; renderUsers(); if (showMessage) showToast("Usuários atualizados."); }
  catch (err) { showToast(err.message || "Não foi possível carregar usuários."); }
}

function renderUsers() {
  const box = $("#usersList"); if (!box) return;
  if (!users.length) { box.className = "records-list empty-state"; box.textContent = "Nenhum usuário cadastrado."; return; }

  const canDeleteUsers = Number(currentUser?.roleLevel || 1) >= 3 || currentUser?.isSuper;
  const myUsername = String(currentUser?.username || "").toLowerCase();

  box.className = "records-list";
  box.innerHTML = users.map(u => {
    const isSelf = String(u.username || "").toLowerCase() === myUsername;
    const isSuperUser = Number(u.is_super) === 1;
    const deleteButton = canDeleteUsers && !isSelf && !isSuperUser
      ? `<button class="danger-btn" type="button" data-user-action="delete" data-id="${escapeAttr(u.id)}">Excluir usuário</button>`
      : "";

    return `
    <article class="user-card">
      <header>
        <div><strong>${escapeHtml(u.nickname)}</strong><small>@${escapeHtml(u.username)} • Servidor ${escapeHtml(u.server || "39")}</small></div>
        <span class="role-pill">${escapeHtml(displayRoleName(u))}</span>
      </header>
      ${Number(u.blocked) === 1 ? '<span class="blocked-pill">Bloqueado</span>' : ''}
      <small>${Number(u.punishment_count || 0)} punições aplicadas</small>
      <div class="user-actions">
        <button class="ghost-btn" type="button" data-user-action="edit" data-id="${escapeAttr(u.id)}">Alterar usuário/senha</button>
        <button class="soft-btn" type="button" data-user-action="toggle" data-id="${escapeAttr(u.id)}">${Number(u.blocked) === 1 ? 'Desbloquear' : 'Bloquear'}</button>
        <button class="primary-btn" type="button" data-user-action="punishments" data-username="${escapeAttr(u.username)}">Ver punições</button>
        <button class="ghost-btn" type="button" data-user-action="export-admin" data-username="${escapeAttr(u.username)}">Exportar registros do admin</button>
        ${deleteButton}
      </div>
    </article>`;
  }).join("");
  $$('[data-user-action]', box).forEach(btn => btn.addEventListener('click', handleUserAction));
}


function displayRoleName(u) {
  if ((u.username || "").toLowerCase() === "developer" || Number(u.is_super) === 1) {
    return "Desenvolvedor (3)";
  }
  return `${u.role_name || "Admin"} (${Number(u.role_level) || 1})`;
}

async function handleUserAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.userAction;
  if (action === "punishments" || action === "export-admin") {
    const username = btn.dataset.username;
    const admin = users.find(u => u.username === username) || { username, nickname: username, server: "39", role_level: 1, role_name: "Admin" };
    if (action === "export-admin") {
      exportMonthlyReport({ mode: "admin", admin });
      return;
    }
    openAdminInfo(admin);
    return;
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

    let roleLevel = Number(user.role_level || 1);
    if (Number(currentUser?.roleLevel || 1) >= 3 || currentUser?.isSuper) {
      const rolePrompt = prompt("Cargo: 1 = Admin, 2 = Líder, 3 = Desenvolvedor", String(roleLevel));
      if (rolePrompt === null) return;
      roleLevel = Number(rolePrompt);
      if (![1, 2, 3].includes(roleLevel)) return showToast("Cargo inválido. Use 1, 2 ou 3.");
    }

    const password = prompt("Nova senha (deixe vazio para manter):", "");
    try { await api.updateUser(user.id, { username, nickname, server, password, roleLevel }); await loadUsers(true); showToast("Usuário atualizado."); }
    catch (err) { showToast(err.message || "Não foi possível atualizar."); }
  }

  if (action === "delete") {
    if (!(Number(currentUser?.roleLevel || 1) >= 3 || currentUser?.isSuper)) {
      return showToast("Somente Desenvolvedor pode excluir usuários.");
    }
    if (Number(user.is_super) === 1 || String(user.username || "").toLowerCase() === String(currentUser?.username || "").toLowerCase()) {
      return showToast("Esse usuário não pode ser excluído.");
    }

    const confirmName = prompt(`Digite o usuário ${user.username} para confirmar a exclusão:`);
    if (confirmName !== user.username) return showToast("Exclusão cancelada.");

    const deletePassword = prompt("Senha de exclusão:");
    if (deletePassword === null) return;

    try {
      await api.deleteUser(user.id, { deletePassword });
      await loadUsers(true);
      showToast("Usuário excluído.");
    } catch (err) {
      showToast(err.message || "Não foi possível excluir.");
    }
  }
}

function fromApiRecord(r) {
  return { id: r.id, type: r.type, playerName: r.player_name, time: r.punishment_time, reason: r.reason, observation: r.observation, article: r.article, server: r.server || "39", occurredDate: r.occurred_date, evidenceUrl: r.evidence_url, createdBy: r.created_by || "Desenvolvedor", createdByUsername: r.created_by_username || "", createdAt: r.created_at };
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
function openDetail(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  $("#modalContent").innerHTML = detailHtml(r);
  $("#detailModal").classList.remove("hidden");
  $("#copyLinkBtn")?.addEventListener("click", () => copyShareLink(r));
  $("#deleteRecordBtn")?.addEventListener("click", () => deleteRecord(r));
  $("#adminInfoBtn")?.addEventListener("click", () => openAdminInfo(getAdminForRecord(r)));
}
function closeModal() { $("#detailModal").classList.add("hidden"); }
function detailHtml(r) {
  const canDeleteRecord = Number(currentUser?.roleLevel || 1) >= 3 || currentUser?.isSuper;
  return `<div class="detail-header"><img src="assets/logo-rio-rise.jpg" alt="Rio Rise"><div><span class="eyebrow">Rio Rise • Servidor ${escapeHtml(r.server)}</span><h2 id="modalTitle">Ficha de punição</h2></div></div>${recordGridHtml(r)}<div class="detail-actions"><button id="copyLinkBtn" class="primary-btn" type="button">Copiar link da ficha</button>${r.evidenceUrl ? `<a class="ghost-btn" href="${escapeAttr(normalizeUrl(r.evidenceUrl))}" target="_blank" rel="noopener">Abrir evidência</a>` : ""}${canDeleteRecord ? `<button id="deleteRecordBtn" class="danger-btn" type="button">Excluir registro</button>` : ""}</div>`;
}

async function deleteRecord(r) {
  if (!(Number(currentUser?.roleLevel || 1) >= 3 || currentUser?.isSuper)) {
    return showToast("Somente Desenvolvedor pode excluir registros.");
  }

  const ok = confirm(`Excluir o registro de ${r.playerName}? Essa ação não pode ser desfeita.`);
  if (!ok) return;

  try {
    await api.deletePunishment(r.id);
    records = records.filter(item => item.id !== r.id);
    closeModal();
    renderAll();
    showToast("Registro excluído.");
  } catch (err) {
    showToast(err.message || "Não foi possível excluir o registro.");
  }
}
function recordGridHtml(r) {
  const ev = normalizeUrl(r.evidenceUrl || "");
  const canSeeAdmin = !!currentUser?.canManageUsers;
  const adminHtml = canSeeAdmin
    ? `<button id="adminInfoBtn" class="link-btn" type="button">${escapeHtml(r.createdBy)}</button>`
    : escapeHtml(r.createdBy);
  return `<div class="detail-grid"><div class="meta-value"><small>Nome do jogador</small><p>${escapeHtml(r.playerName)}</p></div><div class="meta-value"><small>Tipo de punição</small><p>${escapeHtml(r.type)}</p></div><div class="meta-value"><small>Tempo</small><p>${escapeHtml(r.time)}</p></div><div class="meta-value"><small>Servidor</small><p>${escapeHtml(r.server)}</p></div><div class="meta-value"><small>Data do ocorrido</small><p>${formatDate(r.occurredDate)}</p></div><div class="meta-value"><small>Artigo</small><p>${escapeHtml(r.article)}</p></div><div class="meta-value"><small>Registrado por</small><p>${adminHtml}</p></div><div class="meta-value"><small>Criado em</small><p>${formatDateTime(r.createdAt)}</p></div><div class="meta-value wide"><small>Motivo</small><p>${escapeHtml(r.reason)}</p></div><div class="meta-value wide"><small>Observação</small><p>${escapeHtml(r.observation || "Sem observação.")}</p></div><div class="meta-value wide"><small>Evidência</small>${ev ? `<p class="evidence-link-wrap"><a class="evidence-link" href="${escapeAttr(ev)}" target="_blank" rel="noopener">${escapeHtml(ev)}</a></p>` : `<p>Nenhum link de evidência foi informado.</p>`}</div></div>`;
}

function getAdminForRecord(r) {
  return users.find(u => u.username === r.createdByUsername)
    || users.find(u => u.nickname === r.createdBy)
    || { username: r.createdByUsername || r.createdBy || "", nickname: r.createdBy || r.createdByUsername || "Sem admin", server: r.server || "39", role_level: 1, role_name: "Admin", punishment_count: records.filter(x => x.createdByUsername === r.createdByUsername || x.createdBy === r.createdBy).length };
}

function openAdminInfo(admin) {
  const adminRecords = records.filter(r => r.createdByUsername === admin.username || r.createdBy === admin.nickname || r.createdBy === admin.username);
  const monthRecords = filterCurrentMonth(adminRecords);
  $("#modalContent").innerHTML = `
    <div class="detail-header"><img src="assets/logo-rio-rise.jpg" alt="Rio Rise"><div><span class="eyebrow">Informações do administrador</span><h2>${escapeHtml(admin.nickname || admin.username)}</h2></div></div>
    <div class="detail-grid">
      <div class="meta-value"><small>Usuário</small><p>@${escapeHtml(admin.username || "—")}</p></div>
      <div class="meta-value"><small>Nickname</small><p>${escapeHtml(admin.nickname || "—")}</p></div>
      <div class="meta-value"><small>Cargo</small><p>${escapeHtml(displayRoleName(admin))}</p></div>
      <div class="meta-value"><small>Servidor</small><p>${escapeHtml(admin.server || "39")}</p></div>
      <div class="meta-value"><small>Total de registros</small><p>${adminRecords.length}</p></div>
      <div class="meta-value"><small>Registros do mês</small><p>${monthRecords.length}</p></div>
    </div>
    <div class="detail-actions"><button id="exportAdminReportBtn" class="primary-btn" type="button">Exportar registros do admin</button></div>
    <div id="tempRecords" class="records-list"></div>
  `;
  $("#exportAdminReportBtn")?.addEventListener("click", () => exportMonthlyReport({ mode: "admin", admin }));
  renderRecordButtons($("#tempRecords"), adminRecords, "Nenhuma punição encontrada para esse admin.");
  $("#detailModal").classList.remove("hidden");
}

function filterCurrentMonth(items) {
  const now = new Date();
  return items.filter(r => {
    const base = r.occurredDate || r.createdAt;
    const d = new Date(base);
    return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
}

function adminSummaryRows(monthRecords) {
  const map = new Map();
  monthRecords.forEach(r => {
    const key = r.createdByUsername || r.createdBy || "sem-usuario";
    const cur = map.get(key) || { nickname: r.createdBy || "Sem admin", username: r.createdByUsername || "—", server: r.server || "39", count: 0 };
    cur.count += 1;
    map.set(key, cur);
  });
  const rows = [...map.values()].sort((a, b) => b.count - a.count || a.nickname.localeCompare(b.nickname));
  return rows.map(a => `<tr><td>${escapeHtml(a.nickname)}</td><td>@${escapeHtml(a.username)}</td><td>${escapeHtml(a.server)}</td><td>${a.count}</td></tr>`).join("") || `<tr><td colspan="4">Nenhum admin com registro neste mês.</td></tr>`;
}


function getAvailableServersForExport() {
  const values = new Set();

  records.forEach(r => {
    const server = String(r.server || "").trim();
    if (server) values.add(server);
  });

  users.forEach(u => {
    const server = String(u.server || "").trim();
    if (server) values.add(server);
  });

  if (!values.size) values.add("39");

  return [...values].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b, "pt-BR", { numeric: true });
  });
}

function chooseServersForFullLog() {
  if (!(Number(currentUser?.roleLevel || 1) >= 2 || currentUser?.isSuper)) {
    return showToast("Somente Líder ou Desenvolvedor pode exportar logs.");
  }

  const servers = getAvailableServersForExport();

  $("#modalContent").innerHTML = `
    <div class="detail-header">
      <img src="assets/logo-rio-rise.jpg" alt="Rio Rise">
      <div>
        <span class="eyebrow">Exportar log completa</span>
        <h2>Selecionar servidores</h2>
      </div>
    </div>

    <p class="modal-help">Selecione quais servidores devem entrar na log completa do mês.</p>

    <div class="server-select-box">
      <label class="check-line check-all-line">
        <input id="selectAllServers" type="checkbox" checked>
        <span>Todos os servidores</span>
      </label>

      <div class="server-check-grid">
        ${servers.map(server => `
          <label class="check-line">
            <input class="server-export-check" type="checkbox" value="${escapeAttr(server)}" checked>
            <span>Servidor ${escapeHtml(server)}</span>
          </label>
        `).join("")}
      </div>
    </div>

    <div class="detail-actions">
      <button id="confirmFullLogExportBtn" class="primary-btn" type="button">Exportar selecionados</button>
      <button id="cancelFullLogExportBtn" class="ghost-btn" type="button">Cancelar</button>
    </div>
  `;

  $("#detailModal").classList.remove("hidden");

  const allCheck = $("#selectAllServers");
  const checks = $$(".server-export-check");

  allCheck?.addEventListener("change", () => {
    checks.forEach(check => { check.checked = allCheck.checked; });
  });

  checks.forEach(check => {
    check.addEventListener("change", () => {
      if (!check.checked && allCheck) allCheck.checked = false;
      if (allCheck && checks.every(item => item.checked)) allCheck.checked = true;
    });
  });

  $("#cancelFullLogExportBtn")?.addEventListener("click", closeModal);
  $("#confirmFullLogExportBtn")?.addEventListener("click", () => {
    const selectedServers = checks
      .filter(check => check.checked)
      .map(check => check.value);

    if (!selectedServers.length) {
      showToast("Selecione pelo menos um servidor.");
      return;
    }

    closeModal();
    exportMonthlyReport({ mode: "full", servers: selectedServers });
  });
}

async function exportMonthlyReport({ mode = "full", admin = null, servers = null } = {}) {
  if (!(Number(currentUser?.roleLevel || 1) >= 2 || currentUser?.isSuper)) {
    return showToast("Somente Líder ou Desenvolvedor pode exportar logs.");
  }

  const selectedServers = Array.isArray(servers) && servers.length
    ? servers.map(server => String(server))
    : null;

  const source = mode === "admin" && admin
    ? records.filter(r => r.createdByUsername === admin.username || r.createdBy === admin.nickname || r.createdBy === admin.username)
    : records.filter(r => !selectedServers || selectedServers.includes(String(r.server || "")));

  const monthRecords = filterCurrentMonth(source);
  const now = new Date();
  const monthName = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const serverLabel = selectedServers
    ? selectedServers.map(server => `Servidor ${server}`).join(", ")
    : "Todos os servidores";
  const title = mode === "admin" && admin ? `Relatório mensal do admin ${admin.nickname || admin.username}` : "Relatório mensal completo de logs";
  const fileName = mode === "admin" && admin
    ? `registros-${slug(admin.username || admin.nickname)}-${now.toISOString().slice(0,7)}.html`
    : `log-completa-rio-rise-${now.toISOString().slice(0,7)}.html`;

  const rows = monthRecords.map((r, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(r.playerName)}</td>
      <td>${escapeHtml(r.type)}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td>${escapeHtml(r.time)}</td>
      <td>${formatDate(r.occurredDate)}</td>
      <td>${escapeHtml(r.createdBy)}</td>
      <td>${r.evidenceUrl ? `<a href="${escapeAttr(normalizeUrl(r.evidenceUrl))}">${escapeHtml(normalizeUrl(r.evidenceUrl))}</a>` : "Sem evidência"}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">Nenhum registro encontrado neste mês.</td></tr>`;

  const adminInfo = mode === "admin" && admin ? `
    <section class="info">
      <h2>Informações do administrador</h2>
      <p><b>Nickname:</b> ${escapeHtml(admin.nickname || "—")}</p>
      <p><b>Usuário:</b> @${escapeHtml(admin.username || "—")}</p>
      <p><b>Cargo:</b> ${escapeHtml(displayRoleName(admin))}</p>
      <p><b>Servidor:</b> ${escapeHtml(admin.server || "39")}</p>
      <p><b>Total no mês:</b> ${monthRecords.length}</p>
    </section>
  ` : `<section class="info"><h2>Resumo geral</h2><p><b>Servidores selecionados:</b> ${escapeHtml(serverLabel)}</p><p><b>Total de registros do mês:</b> ${monthRecords.length}</p><p><b>Exportado por:</b> ${escapeHtml(currentUser?.nickname || "—")}</p><h3>Admins no relatório</h3><table class="mini-table"><thead><tr><th>Admin</th><th>Usuário</th><th>Servidor</th><th>Registros no mês</th></tr></thead><tbody>${adminSummaryRows(monthRecords)}</tbody></table></section>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171527;background:#fff}.header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #6d4cff;padding-bottom:14px;margin-bottom:18px}.header img{width:82px;height:82px;border-radius:50%;object-fit:cover}.header h1{margin:0;font-size:24px}.header p{margin:4px 0 0;color:#555}.info{border:1px solid #ddd;border-radius:14px;padding:14px;margin:16px 0;background:#fafafa}.info h2{margin:0 0 10px;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}th,td{border:1px solid #d7d7d7;padding:9px;text-align:left;vertical-align:top}th{background:#6d4cff;color:white}.mini-table{margin-top:12px}.mini-table th{background:#22184d;color:white}tr:nth-child(even){background:#f7f7fb}a{color:#4c2ee8;word-break:break-all}.footer{margin-top:24px;color:#777;font-size:12px}@media print{body{margin:12px}.no-print{display:none}}</style></head><body>
    <header class="header"><img src="${location.origin}/assets/logo-rio-rise.jpg" alt="Rio Rise"><div><h1>${escapeHtml(title)}</h1><p>${mode === "admin" && admin ? `Rio Rise • Servidor ${escapeHtml(admin.server || "39")}` : `Rio Rise • ${escapeHtml(serverLabel)}`} • ${escapeHtml(monthName)}</p><p>Exportado em ${new Date().toLocaleString("pt-BR")}</p></div></header>
    ${adminInfo}
    <table><thead><tr><th>Nº</th><th>Jogador punido</th><th>Tipo</th><th>Motivo</th><th>Tempo</th><th>Data</th><th>Admin</th><th>Evidência</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="footer">Relatório gerado automaticamente pelo Painel Rio Rise.</p>
  </body></html>`;

  downloadText(fileName, html, "text/html;charset=utf-8");
  showToast("Relatório exportado.");
}

function downloadText(fileName, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slug(v) {
  return String(v || "relatorio").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "relatorio";
}

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
function exportSpreadsheet(){ if(!(Number(currentUser?.roleLevel || 1) >= 2 || currentUser?.isSuper)) return showToast("Somente Líder ou Desenvolvedor pode exportar planilha."); if(!window.XLSX) return showToast("Biblioteca de planilha não carregou."); const base=location.href.split("#")[0]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Backup Rio Rise - Servidor 39"],[],["Exportado em",new Date().toLocaleString("pt-BR")],["Total de registros",records.length],["Punições no mês",getCurrentMonthRecords().length],["Meta mensal",settings.monthlyGoal],["Usuário",currentUser?.nickname||""]]),"Resumo"); const rows=records.map((r,i)=>({"Nº":i+1,"ID":r.id,"Tipo de punição":r.type,"Nome do jogador":r.playerName,"Tempo":r.time,"Motivo":r.reason,"Observação":r.observation||"Sem observação.","Artigo":r.article,"Servidor":r.server,"Data do ocorrido":formatDate(r.occurredDate),"Link da evidência":normalizeUrl(r.evidenceUrl||""),"Link da ficha":`${base}#ficha=${encodeURIComponent(r.id)}`,"Registrado por":r.createdBy,"Usuário interno":r.createdByUsername,"Criado em":formatDateTime(r.createdAt)})); const ws=XLSX.utils.json_to_sheet(rows); ws["!autofilter"]={ref:XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"]||"A1:O1"))}; XLSX.utils.book_append_sheet(wb,ws,"Registros"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(getOrderedTypeSummary()),"Resumo por Tipo"); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(getPlayerSummary()),"Resumo por Jogador"); XLSX.writeFile(wb,`backup-rio-rise-servidor-39-${new Date().toISOString().slice(0,10)}.xlsx`); }
function normalizeUrl(v){ const url=String(v||"").trim(); if(!url) return ""; return /^https?:\/\//i.test(url)?url:`https://${url}`; }
async function copyText(text){ if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text); const t=document.createElement("textarea"); t.value=text; t.style.position="fixed"; t.style.opacity="0"; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
function showToast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden"); clearTimeout(showToast.timeout); showToast.timeout=setTimeout(()=>t.classList.add("hidden"),3000); }
function formatDate(v){ if(!v) return "—"; const [y,m,d]=v.slice(0,10).split("-"); return y&&m&&d?`${d}/${m}/${y}`:v; }
function formatDateTime(v){ if(!v) return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?v:d.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}); }
function escapeHtml(v){ return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function escapeAttr(v){ return escapeHtml(v).replaceAll("`","&#096;"); }
init();
