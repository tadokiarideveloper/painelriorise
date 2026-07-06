const TOKEN_KEY = "rioRise.cloudflare.token.v1";
const SETTINGS_KEY = "rioRise.settings.v1";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let records = [];
let settings = { monthlyGoal: 30 };
let lastSavedId = null;

const api = {
  async request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        showLogin();
      }
      throw new Error(data?.error || data?.message || "Erro na comunicação com o servidor.");
    }
    return data;
  },
  login(username, password) {
    return this.request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },
  listPunishments() {
    return this.request("/api/punishments");
  },
  createPunishment(payload) {
    return this.request("/api/punishments", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  deletePunishment(id) {
    return this.request(`/api/punishments/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  getPublicPunishment(id) {
    return this.request(`/api/public/${encodeURIComponent(id)}`, { headers: {} });
  }
};

function init() {
  setDefaultDate();
  loadSettings();
  bindEvents();

  window.addEventListener("hashchange", handleRoute);

  window.setTimeout(() => {
    $("#loader").classList.add("fade-out");
    window.setTimeout(() => $("#loader").classList.add("hidden"), 560);
    handleRoute();
  }, 850);
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
  });

  $$(".nav-link").forEach((button) => {
    button.addEventListener("click", () => activateSection(button.dataset.target));
  });

  $("#goalInput").addEventListener("input", (event) => {
    const value = Math.max(1, Number(event.target.value) || 1);
    settings.monthlyGoal = value;
    saveSettings();
    renderDashboard();
  });

  $("#punishmentForm").addEventListener("submit", handlePunishmentSubmit);
  $("#punishmentForm").addEventListener("reset", () => window.setTimeout(setDefaultDate, 0));
  $("#copyLastLinkBtn").addEventListener("click", () => {
    const record = records.find((item) => item.id === lastSavedId);
    if (record) copyShareLink(record);
  });

  $("#searchInput").addEventListener("input", renderSearchResults);
  $("#clearSearchBtn").addEventListener("click", () => {
    $("#searchInput").value = "";
    renderSearchResults();
  });

  $("#exportBtn").addEventListener("click", exportSpreadsheet);
  const refreshBtn = $("#refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadRecords(true));

  $("#detailModal").addEventListener("click", (event) => {
    if (event.target.dataset.close === "modal") closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

async function handleRoute() {
  const publicId = getPublicIdFromHash();
  if (publicId) {
    await renderPublicView(publicId);
    return;
  }

  $("#publicView").classList.add("hidden");
  $("#app").classList.remove("hidden");

  if (sessionStorage.getItem(TOKEN_KEY)) {
    showDashboard();
    await loadRecords(false);
  } else {
    showLogin();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const user = $("#loginUser").value.trim();
  const pass = $("#loginPass").value;
  $("#loginError").textContent = "";

  try {
    const data = await api.login(user, pass);
    sessionStorage.setItem(TOKEN_KEY, data.token);
    $("#loginForm").reset();
    showDashboard();
    await loadRecords(true);
  } catch (error) {
    $("#loginError").textContent = error.message || "Usuário ou senha incorretos.";
  }
}

function showLogin() {
  $("#publicView").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#loginScreen").classList.remove("hidden");
  $("#dashboard").classList.add("hidden");
}

function showDashboard() {
  $("#publicView").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#loginScreen").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  activateSection("overview");
  renderAll();
}

function activateSection(id) {
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.target === id));
  $$(".page-section").forEach((section) => section.classList.toggle("active-section", section.id === id));
  if (id === "overview") renderDashboard();
  if (id === "search") renderSearchResults();
  if (id === "records") renderRecordsList();
}

async function loadRecords(showMessage = false) {
  try {
    const data = await api.listPunishments();
    records = (data.records || []).map(fromApiRecord);
    renderAll();
    if (showMessage) showToast("Banco atualizado.");
  } catch (error) {
    showToast(error.message || "Não foi possível carregar o banco.");
  }
}

function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {}
  $("#goalInput").value = settings.monthlyGoal || 30;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setDefaultDate() {
  const input = $("#occurredDate");
  if (input && !input.value) input.value = new Date().toISOString().slice(0, 10);
  const server = $("#server");
  if (server && !server.value) server.value = "39";
}

async function handlePunishmentSubmit(event) {
  event.preventDefault();

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
    $("#punishmentForm").reset();
    setDefaultDate();
    renderAll();
    showToast("Punição salva no banco de dados.");
    openDetail(record.id);
  } catch (error) {
    showToast(error.message || "Não foi possível salvar.");
  }
}

function fromApiRecord(record) {
  return {
    id: record.id,
    type: record.type,
    playerName: record.player_name,
    time: record.punishment_time,
    reason: record.reason,
    observation: record.observation,
    article: record.article,
    server: record.server || "39",
    occurredDate: record.occurred_date,
    evidenceUrl: record.evidence_url,
    createdBy: record.created_by || "Admin Kiari",
    createdAt: record.created_at
  };
}

function renderAll() {
  renderDashboard();
  renderSearchResults();
  renderRecordsList();
}

function renderDashboard() {
  const monthRecords = getCurrentMonthRecords();
  const banCount = records.filter((record) => (record.type || "").toLowerCase().includes("ban")).length;
  const goal = Number(settings.monthlyGoal) || 30;
  const percent = Math.min(100, Math.round((monthRecords.length / goal) * 100));

  $("#monthCount").textContent = monthRecords.length;
  $("#totalCount").textContent = records.length;
  $("#banCount").textContent = banCount;
  $("#progressPercent").textContent = `${percent}%`;
  $("#progressText").textContent = `${monthRecords.length} de ${goal} registros`;
  $("#progressCircle").style.background = `conic-gradient(var(--purple-2) ${percent * 3.6}deg, rgba(255,255,255,0.1) 0deg)`;

  renderRecentList();
  drawTypeChart();
  drawDailyChart();
}

function renderRecentList() {
  const list = $("#recentList");
  const recent = records.slice(0, 5);
  if (!recent.length) {
    list.className = "recent-list empty-state";
    list.textContent = "Nenhum registro ainda.";
    return;
  }

  list.className = "recent-list";
  list.innerHTML = recent.map((record) => `
    <button class="mini-record" data-id="${escapeAttr(record.id)}" type="button">
      <strong>${escapeHtml(record.playerName)}</strong>
      <span>${escapeHtml(record.type)} • ${formatDate(record.occurredDate)}</span>
    </button>
  `).join("");
  $$(".mini-record", list).forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.id)));
}

function renderSearchResults() {
  const query = ($("#searchInput")?.value || "").trim().toLowerCase();
  const container = $("#searchResults");
  if (!container) return;

  if (!query) {
    container.className = "records-list empty-state";
    container.textContent = "Nenhum jogador pesquisado.";
    return;
  }

  const items = records.filter((record) => (record.playerName || "").toLowerCase().includes(query));
  renderRecordButtons(container, items, "Nenhum registro encontrado para esse jogador.");
}

function renderRecordsList() {
  const container = $("#recordsList");
  renderRecordButtons(container, records, "Nenhum registro salvo no banco.");
}

function renderRecordButtons(container, items, emptyText) {
  if (!container) return;
  if (!items.length) {
    container.className = "records-list empty-state";
    container.textContent = emptyText;
    return;
  }

  container.className = "records-list";
  container.innerHTML = items.map((record) => `
    <button class="record-item" data-id="${escapeAttr(record.id)}" type="button">
      <div class="record-main">
        <span class="badge">${escapeHtml(record.type)}</span>
        <strong>${escapeHtml(record.playerName)}</strong>
        <span>${escapeHtml(record.reason)} • Artigo ${escapeHtml(record.article)}</span>
      </div>
      <div class="record-side">
        <strong>${formatDate(record.occurredDate)}</strong><br>
        Servidor ${escapeHtml(record.server || "39")}
      </div>
    </button>
  `).join("");
  $$(".record-item", container).forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.id)));
}

function openDetail(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const modalContent = $("#modalContent");
  modalContent.innerHTML = renderDetailHtml(record, true);
  $("#detailModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const copyButton = $("#copyLinkBtn");
  if (copyButton) copyButton.addEventListener("click", () => copyShareLink(record));

  const deleteButton = $("#deleteRecordBtn");
  if (deleteButton) deleteButton.addEventListener("click", () => deleteRecord(record.id));
}

function closeModal() {
  $("#detailModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function renderDetailHtml(record, adminMode = false) {
  const evidenceInfo = renderEvidenceLink(record.evidenceUrl);

  return `
    <div class="detail-header">
      <img src="assets/logo-rio-rise.jpg" alt="Rio Rise" />
      <div>
        <span class="eyebrow">Ficha de punição</span>
        <h2 id="modalTitle">${escapeHtml(record.playerName)}</h2>
      </div>
    </div>
    <div class="detail-grid">
      ${meta("Tipo de punição", record.type)}
      ${meta("Tempo", record.time)}
      ${meta("Servidor", record.server || "39")}
      ${meta("Data do ocorrido", formatDate(record.occurredDate))}
      ${meta("Artigo", record.article)}
      ${meta("Registrado por", record.createdBy || "Admin Kiari")}
      ${meta("Motivo", record.reason, true)}
      ${meta("Observação", record.observation || "Sem observação.", true)}
      <div class="meta-value wide">
        <small>Evidência</small>
        ${evidenceInfo}
      </div>
    </div>
    ${adminMode ? `
      <div class="detail-actions">
        <button id="copyLinkBtn" class="primary-btn" type="button">Copiar link dessa ficha</button>
        <button id="deleteRecordBtn" class="ghost-btn" type="button">Excluir registro</button>
      </div>
    ` : ""}
  `;
}

function meta(label, value, wide = false) {
  return `<div class="meta-value ${wide ? "wide" : ""}"><small>${escapeHtml(label)}</small><p>${escapeHtml(value || "—")}</p></div>`;
}

function normalizeUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function renderEvidenceLink(url) {
  const safeUrl = normalizeUrl(url || "");
  if (!safeUrl) return "<p>Nenhum link de evidência informado.</p>";
  const visibleUrl = safeUrl.length > 110 ? `${safeUrl.slice(0, 110)}...` : safeUrl;
  return `
    <p class="evidence-link-wrap">
      <a class="evidence-link" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(visibleUrl)}</a>
    </p>
    <p><a class="primary-btn" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">Abrir evidência</a></p>
  `;
}

async function deleteRecord(id) {
  if (!confirm("Tem certeza que deseja excluir este registro do banco?")) return;
  try {
    await api.deletePunishment(id);
    records = records.filter((record) => record.id !== id);
    closeModal();
    renderAll();
    showToast("Registro excluído do banco.");
  } catch (error) {
    showToast(error.message || "Não foi possível excluir.");
  }
}

function copyShareLink(record) {
  const base = window.location.href.split("#")[0];
  const url = `${base}#ficha=${encodeURIComponent(record.id)}`;
  copyText(url).then(
    () => showToast("Link da ficha copiado."),
    () => showToast("Não foi possível copiar automaticamente.")
  );
}

function getPublicIdFromHash() {
  if (!window.location.hash.startsWith("#ficha=")) return null;
  return decodeURIComponent(window.location.hash.replace("#ficha=", "").trim());
}

async function renderPublicView(id) {
  $("#app").classList.add("hidden");
  const publicView = $("#publicView");
  publicView.classList.remove("hidden");
  publicView.innerHTML = `
    <article class="public-card">
      <div class="public-header">
        <img src="assets/logo-rio-rise.jpg" alt="Rio Rise" />
        <div>
          <span class="eyebrow">Rio Rise • Servidor 39</span>
          <h1>Carregando ficha...</h1>
        </div>
      </div>
    </article>
  `;

  try {
    const data = await api.getPublicPunishment(id);
    const record = fromApiRecord(data.record);
    publicView.innerHTML = `
      <article class="public-card">
        <div class="public-header">
          <img src="assets/logo-rio-rise.jpg" alt="Rio Rise" />
          <div>
            <span class="eyebrow">Rio Rise • Servidor ${escapeHtml(record.server || "39")}</span>
            <h1>Ficha de punição</h1>
          </div>
        </div>
        <div class="public-grid">
          ${meta("Nome do jogador", record.playerName)}
          ${meta("Tipo de punição", record.type)}
          ${meta("Tempo", record.time)}
          ${meta("Servidor", record.server || "39")}
          ${meta("Data do ocorrido", formatDate(record.occurredDate))}
          ${meta("Artigo", record.article)}
          ${meta("Registrado por", record.createdBy || "Admin Kiari")}
          ${meta("Criado em", formatDateTime(record.createdAt))}
          ${meta("Motivo", record.reason, true)}
          ${meta("Observação", record.observation || "Sem observação.", true)}
          <div class="meta-value wide">
            <small>Evidência</small>
            ${renderEvidenceLink(record.evidenceUrl)}
          </div>
        </div>
      </article>
    `;
  } catch (error) {
    publicView.innerHTML = `
      <article class="public-card">
        <div class="public-header">
          <img src="assets/logo-rio-rise.jpg" alt="Rio Rise" />
          <div>
            <span class="eyebrow">Rio Rise</span>
            <h1>Ficha não encontrada</h1>
          </div>
        </div>
        <p class="public-note">O link pode estar errado ou o registro foi removido do banco.</p>
      </article>
    `;
  }
}

function drawTypeChart() {
  const canvas = $("#typeChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 680;
  const cssHeight = canvas.clientHeight || 320;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const types = ["Ban", "Jail", "Mute", "Mute Report", "Kick", "Solicitação de Ban", "Solicitação de Kick"];
  const summary = getTypeSummary();
  const values = types.map((type) => summary[type] || 0);
  const max = Math.max(1, ...values);
  const padding = 36;
  const barGap = 12;
  const barWidth = Math.max(18, (cssWidth - padding * 2 - barGap * (types.length - 1)) / types.length);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui";

  types.forEach((type, index) => {
    const value = values[index];
    const height = Math.max(6, (cssHeight - 96) * (value / max));
    const x = padding + index * (barWidth + barGap);
    const y = cssHeight - 54 - height;
    const gradient = ctx.createLinearGradient(0, y, 0, cssHeight - 54);
    gradient.addColorStop(0, "rgba(159,144,255,0.95)");
    gradient.addColorStop(1, "rgba(113,61,244,0.55)");
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, barWidth, height, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(String(value), x + barWidth / 2 - 4, y - 8);
    ctx.save();
    ctx.translate(x + barWidth / 2, cssHeight - 40);
    ctx.rotate(-0.45);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.66)";
    ctx.fillText(type, 0, 0);
    ctx.restore();
  });
}

function drawDailyChart() {
  const canvas = $("#dailyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 680;
  const cssHeight = canvas.clientHeight || 320;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date;
  });
  const values = days.map((day) => records.filter((record) => sameDay(new Date(record.createdAt), day)).length);
  const max = Math.max(1, ...values);
  const padding = 36;
  const step = (cssWidth - padding * 2) / Math.max(1, days.length - 1);
  const points = values.map((value, index) => ({
    x: padding + step * index,
    y: cssHeight - 54 - ((cssHeight - 96) * (value / max)),
    value,
    label: days[index].toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  }));

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = 30 + i * ((cssHeight - 90) / 3);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(cssWidth - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(159,144,255,0.96)";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = "rgba(113,61,244,0.9)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(point.value), point.x, point.y - 12);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText(point.label, point.x, cssHeight - 30);
  });
}

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sameDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function getCurrentMonthRecords() {
  const now = new Date();
  return records.filter((record) => {
    const date = new Date(record.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function getTypeSummary() {
  const summary = {};
  records.forEach((record) => {
    const type = record.type || "Sem tipo";
    summary[type] = (summary[type] || 0) + 1;
  });
  return summary;
}

function getOrderedTypeSummary() {
  return Object.entries(getTypeSummary())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function getPlayerSummary() {
  const map = new Map();
  records.forEach((record) => {
    const name = record.playerName || "Sem nome";
    const current = map.get(name) || { playerName: name, count: 0, lastCreatedAt: record.createdAt };
    current.count += 1;
    if (new Date(record.createdAt) > new Date(current.lastCreatedAt)) current.lastCreatedAt = record.createdAt;
    map.set(name, current);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName));
}

function exportSpreadsheet() {
  if (!window.XLSX) {
    showToast("Biblioteca de planilha não carregou. Tente atualizar a página.");
    return;
  }

  const exportedAt = new Date();
  const base = window.location.href.split("#")[0];
  const monthRecords = getCurrentMonthRecords();
  const typeSummary = getOrderedTypeSummary();
  const playerSummary = getPlayerSummary();

  const resumoRows = [
    ["Backup Rio Rise - Servidor 39"],
    [],
    ["Exportado em", exportedAt.toLocaleString("pt-BR")],
    ["Total de registros", records.length],
    ["Punições no mês atual", monthRecords.length],
    ["Meta mensal configurada", Number(settings.monthlyGoal || 30)],
    ["Registrado por", "Admin Kiari"],
    ["Servidor padrão", "39"]
  ];

  const registrosRows = records.map((record, index) => ({
    "Nº": index + 1,
    "ID": record.id || "",
    "Tipo de punição": record.type || "",
    "Nome do jogador": record.playerName || "",
    "Tempo": record.time || "",
    "Motivo": record.reason || "",
    "Observação": record.observation || "Sem observação.",
    "Artigo": record.article || "",
    "Servidor": record.server || "39",
    "Data do ocorrido": formatDate(record.occurredDate),
    "Link da evidência": normalizeUrl(record.evidenceUrl || ""),
    "Link da ficha": `${base}#ficha=${encodeURIComponent(record.id)}`,
    "Registrado por": record.createdBy || "Admin Kiari",
    "Criado em": formatDateTime(record.createdAt),
    "Criado em ISO": record.createdAt || ""
  }));

  const wb = XLSX.utils.book_new();
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
  wsResumo["!cols"] = [{ wch: 34 }, { wch: 26 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  const wsRegistros = XLSX.utils.json_to_sheet(registrosRows);
  wsRegistros["!cols"] = [
    { wch: 6 }, { wch: 38 }, { wch: 22 }, { wch: 24 }, { wch: 18 },
    { wch: 45 }, { wch: 45 }, { wch: 18 }, { wch: 10 }, { wch: 18 },
    { wch: 48 }, { wch: 48 }, { wch: 18 }, { wch: 20 }, { wch: 28 }
  ];
  wsRegistros["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(wsRegistros["!ref"] || "A1:O1")) };
  XLSX.utils.book_append_sheet(wb, wsRegistros, "Registros");

  const wsTipo = XLSX.utils.json_to_sheet(typeSummary.map((item) => ({
    "Tipo de punição": item.type,
    "Quantidade": item.count
  })));
  wsTipo["!cols"] = [{ wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsTipo, "Resumo por Tipo");

  const wsJogador = XLSX.utils.json_to_sheet(playerSummary.map((item) => ({
    "Jogador": item.playerName,
    "Quantidade de punições": item.count,
    "Última punição": formatDateTime(item.lastCreatedAt)
  })));
  wsJogador["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsJogador, "Resumo por Jogador");

  const filename = `backup-rio-rise-servidor-39-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast("Planilha .xlsx gerada.");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.add("hidden"), 2800);
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

init();
