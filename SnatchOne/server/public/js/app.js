// ─── TOKEN ───────────────────────────────────────────
const getToken = () => localStorage.getItem("snatch_token");
const setToken = (t) => localStorage.setItem("snatch_token", t);
const removeToken = () => localStorage.removeItem("snatch_token");

window.currentOperatorsData = [];
let profileLoaded = false;
let generatedKeysData = null;

// ─── EMOJI AVATAR GENERATOR ───────────────────────────
function getEmojiAvatar(seedText) {
  const emojis = ['👽', '👻', '🤖', '👾', '🎃', '🤡', '👹', '👺', '🥸', '😎', '🤓', '🤠', '🦄', '🐲', '🐊', '🦈', '🐅', '🦍', '🦊', '🐼', '🐧', '🦉', '🐸', '🐢', '🐙', '🦁', '🐶', '🐱', '🐭', '🐹', '🐰', '🐻', '🐨', '🐯', '🐮', '🐷', '🐵', '🐣'];
  let hash = 0;
  const str = String(seedText || "User");
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const emoji = emojis[Math.abs(hash) % emojis.length];
  
  // Создаем SVG с фоном и эмодзи
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f1f5f9" rx="50"/><text x="50" y="68" font-size="50" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// Переменные для графика
let activityChart = null;

// Загружаем данные графика из sessionStorage (сохраняется при перезагрузке страницы)
function loadChartFromStorage() {
  try {
    const saved = sessionStorage.getItem("activityChartData");
    if (saved) {
      const parsed = JSON.parse(saved);
      const now = Date.now();
      const cutoff = now - 20 * 60 * 1000; // 20 минут назад
      // Фильтруем точки старше 20 минут
      const filtered = parsed.filter(p => p.ts >= cutoff);
      return filtered;
    }
  } catch (e) {}
  return [];
}

function saveChartToStorage(points) {
  try {
    sessionStorage.setItem("activityChartData", JSON.stringify(points));
  } catch (e) {}
}

// Массив точек: [{ts: timestamp, label: "HH:MM", value: N}]
let chartPoints = loadChartFromStorage();
const chartLabels = chartPoints.map(p => p.label);
const chartData = chartPoints.map(p => p.value);

// ─── THEME TOGGLE ────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem("snatch_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const newTheme = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("snatch_theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (icon) icon.textContent = theme === "light" ? "🌙" : "☀️";
}

document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

// ─── SIDEBAR TOGGLE ──────────────────────────────────
function initSidebar() {
  const sidebarOpen = localStorage.getItem("snatch_sidebar") !== "closed";
  if (!sidebarOpen) {
    document.getElementById("sidebar")?.classList.add("collapsed");
    document.getElementById("main-header")?.classList.remove("sidebar-open");
    document.getElementById("main-content")?.classList.add("sidebar-collapsed");
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const header = document.getElementById("main-header");
  const main = document.getElementById("main-content");
  const isOpen = !sidebar.classList.contains("collapsed");
  
  if (isOpen) {
    sidebar.classList.add("collapsed");
    header.classList.remove("sidebar-open");
    main.classList.add("sidebar-collapsed");
    localStorage.setItem("snatch_sidebar", "closed");
  } else {
    sidebar.classList.remove("collapsed");
    header.classList.add("sidebar-open");
    main.classList.remove("sidebar-collapsed");
    localStorage.setItem("snatch_sidebar", "open");
  }
}

document.getElementById("sidebar-toggle")?.addEventListener("click", toggleSidebar);

// ─── CLOCK ───────────────────────────────────────────
setInterval(() => {
  const el = document.getElementById("time");
  if (el) el.innerText = new Date().toLocaleTimeString("ru-RU");
}, 1000);

// ─── NAVIGATION ──────────────────────────────────────
document.getElementById("menu-dashboard")?.addEventListener("click", () => switchView("dashboard"));
document.getElementById("menu-licenses")?.addEventListener("click", () => switchView("licenses"));
document.getElementById("menu-users")?.addEventListener("click", () => switchView("users"));

let currentFilter = "all"; // Текущий фильтр таблицы

function switchView(view) {
  // Update content visibility
  document.getElementById("view-dashboard").style.display = "none";
  document.getElementById("view-licenses").style.display = "none";
  document.getElementById("view-users").style.display = "none";
  
  if (view === "dashboard") {
    document.getElementById("view-dashboard").style.display = "block";
  } else if (view === "licenses") {
    document.getElementById("view-licenses").style.display = "block";
  } else if (view === "users") {
    document.getElementById("view-users").style.display = "block";
    fetchUsersList();
  }
  
  // Update sidebar active state
  document.querySelectorAll(".sidebar-item").forEach(item => item.classList.remove("active"));
  if (view === "dashboard") document.getElementById("menu-dashboard")?.classList.add("active");
  if (view === "licenses") document.getElementById("menu-licenses")?.classList.add("active");
  if (view === "users") document.getElementById("menu-users")?.classList.add("active");
}

// ─── FILTER BUTTONS ──────────────────────────────────
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", function() {
    currentFilter = this.dataset.filter;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    filterKeysTable();
  });
});

// ─── MODAL TABS ──────────────────────────────────────
document.querySelectorAll(".modal-tab").forEach(tab => {
  tab.addEventListener("click", function() {
    const targetTab = this.dataset.tab;
    
    // Update active tab
    document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
    this.classList.add("active");
    
    // Update active content
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById(`tab-${targetTab}`)?.classList.add("active");
  });
});

// ─── AUTH ─────────────────────────────────────────────
function checkAuthState() {
  const token = getToken();
  if (token) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("dashboard-screen").style.display = "block";
    initTheme();
    initSidebar();
    fetchDashboard();
    if (!window.dashboardInterval)
      window.dashboardInterval = setInterval(fetchDashboard, 60000);
  } else {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("dashboard-screen").style.display = "none";
    if (window.dashboardInterval) {
      clearInterval(window.dashboardInterval);
      window.dashboardInterval = null;
    }
  }
}

// Нажатие Enter в поле логина/пароля
["login-user", "login-pass"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-login").click();
  });
});

document.getElementById("btn-login").addEventListener("click", async () => {
  const btn = document.getElementById("btn-login");
  const user = document.getElementById("login-user").value.trim();
  const pass = document.getElementById("login-pass").value;
  const err = document.getElementById("login-error");

  if (!user || !pass) {
    showError(err, "Заполните все поля");
    return;
  }

  btn.innerText = "Вход...";
  btn.disabled = true;

  try {
    const res = await fetch("/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (data.success) {
      setToken(data.token);
      err.style.display = "none";
      profileLoaded = false;
      switchView("dashboard");
      checkAuthState();
    } else {
      showError(err, data.error || "Неверный логин или пароль");
    }
  } catch (e) {
    showError(err, "Ошибка соединения с сервером");
  } finally {
    btn.innerText = "Войти в систему";
    btn.disabled = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => {
  removeToken();
  profileLoaded = false;
  checkAuthState();
});

// ─── PROFILE MODAL ────────────────────────────────────
document.getElementById("user-pill-btn")?.addEventListener("click", () => {
  document.getElementById("profile-modal-overlay").style.display = "flex";
});

// ─── CREATE KEYS MODAL ────────────────────────────────
document.getElementById("btn-create-keys-modal")?.addEventListener("click", () => {
  document.getElementById("create-keys-modal").style.display = "flex";
});

// ─── COPY KEY FUNCTION ────────────────────────────────
window.copyKey = function(key, event) {
  event?.preventDefault();
  navigator.clipboard.writeText(key).then(() => {
    const btn = event?.target;
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "✓";
      btn.style.color = "var(--success)";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = "";
      }, 2000);
    }
    showToast("Ключ скопирован!");
  }).catch(() => {
    showToast("Ошибка копирования", true);
  });
};

// ─── FILTER KEYS TABLE ────────────────────────────────
window.currentSuperadminTeamFilter = null;

window.viewTeamKeys = function(teamId, teamName) {
  window.currentSuperadminTeamFilter = teamId;
  switchView('licenses');
  
  // Добавляем бейдж фильтра над таблицей лицензий, если его нет
  let filterBadge = document.getElementById("superadmin-team-filter-badge");
  if (!filterBadge) {
    const filtersContainer = document.querySelector(".filter-buttons").parentNode;
    filterBadge = document.createElement("div");
    filterBadge.id = "superadmin-team-filter-badge";
    filterBadge.style.cssText = "display:none; align-items:center; gap:8px; background:var(--primary-dim); padding:6px 12px; border-radius:var(--radius); border:1px solid var(--primary); margin-right: 10px;";
    
    filterBadge.innerHTML = `
      <span style="font-size:13px; color:var(--primary); font-weight:600;" id="superadmin-team-filter-name"></span>
      <button onclick="window.clearTeamKeysFilter()" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:14px; padding:0;">✖</button>
    `;
    filtersContainer.insertBefore(filterBadge, filtersContainer.firstChild);
  }
  
  document.getElementById("superadmin-team-filter-name").innerText = `Фильтр: ${teamName}`;
  filterBadge.style.display = "flex";
  
  filterKeysTable();
};

window.clearTeamKeysFilter = function() {
  window.currentSuperadminTeamFilter = null;
  const filterBadge = document.getElementById("superadmin-team-filter-badge");
  if (filterBadge) filterBadge.style.display = "none";
  filterKeysTable();
};

window.filterKeysTable = function() {
  const searchValue = document.getElementById("searchKey")?.value.toLowerCase() || "";
  const rows = document.querySelectorAll("#licenses-table .key-row");
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matchesSearch = text.includes(searchValue);
    
    let matchesFilter = true;
    if (currentFilter === "online") {
      matchesFilter = row.classList.contains("status-online");
    } else if (currentFilter === "offline") {
      matchesFilter = row.classList.contains("status-offline");
    }
    
    if (window.currentSuperadminTeamFilter !== null) {
      if (row.getAttribute("data-team-id") != window.currentSuperadminTeamFilter) {
        matchesFilter = false;
      }
    }
    
    row.style.display = (matchesSearch && matchesFilter) ? "" : "none";
  });
};

// ─── TOAST NOTIFICATION ───────────────────────────────
function showToast(message, isError = false) {
  // Простое уведомление в консоли (можно улучшить позже)
  console.log(isError ? `❌ ${message}` : `✅ ${message}`);
}

function showError(el, msg) {
  el.innerText = msg;
  el.style.display = "block";
}

// ─── AVATAR UPLOAD ────────────────────────────────────
document.getElementById("btn-upload-avatar").addEventListener("click", () => {
  document.getElementById("prof-avatar-file").click();
});

document
  .getElementById("prof-avatar-file")
  .addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("Файл слишком большой! Выберите до 3 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
      const b64 = ev.target.result;
      document.getElementById("prof-avatar-base64").value = b64;
      document.getElementById("prof-avatar-preview").src = b64;
      document.getElementById("btn-upload-avatar").textContent =
        "✓ " + file.name;
      document.getElementById("btn-upload-avatar").style.color =
        "var(--primary)";
      document.getElementById("btn-upload-avatar").style.borderColor =
        "var(--primary)";
    };
    reader.readAsDataURL(file);
  });

// ─── SAVE PROFILE ─────────────────────────────────────
document
  .getElementById("btn-save-profile")
  .addEventListener("click", async () => {
    const btn = document.getElementById("btn-save-profile");
    const nickname = document.getElementById("prof-nickname").value;
    const avatar = document.getElementById("prof-avatar-base64").value;
    const telegram = document.getElementById("prof-telegram").value;
    const password = document.getElementById("prof-new-pass").value;

    if (window.forceRenameMode && nickname === window.originalForceNickname) {
      alert("Пожалуйста, измените Имя / Инфо на своё реальное имя!");
      return;
    }

    btn.innerText = "Сохранение...";
    btn.disabled = true;

    try {
      await fetch("/admin/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ nickname, avatar, telegram, password }),
      });
      profileLoaded = false;
      document.getElementById("prof-new-pass").value = "";
      window.forceRenameMode = false; // Отключаем форсированный режим после успешного сохранения
      fetchDashboard();
      showToast("Профиль сохранён!");
      
      // Закрываем модалку
      setTimeout(() => {
        document.getElementById("profile-modal-overlay").style.display = "none";
      }, 1500);
    } catch {
      showToast("Ошибка сети!", true);
    } finally {
      btn.innerText = "Сохранить профиль";
      btn.disabled = false;
    }
  });

// ─── DASHBOARD ────────────────────────────────────────
async function fetchDashboard() {
  try {
    const res = await fetch("/admin/api/status", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 401 || res.status === 403) {
      removeToken();
      checkAuthState();
      return;
    }
    const data = await res.json();
    window.currentOperatorsData = data.operators;

    // Profile
    if (data.profile) {
      const avatarUrl =
        data.profile.avatar || getEmojiAvatar(data.profile.nickname || data.profile.username || "U");
      const nick = data.profile.nickname || "Без имени";
      document.getElementById("hdr-avatar").src = avatarUrl;
      document.getElementById("hdr-nickname").innerText = nick;

      if (!profileLoaded) {
        document.getElementById("prof-avatar-base64").value =
          data.profile.avatar || "";
        document.getElementById("prof-nickname").value =
          data.profile.nickname || "";
        document.getElementById("prof-telegram").value =
          data.profile.telegram || "";
        document.getElementById("prof-avatar-preview").src = avatarUrl;
        if (data.profile.avatar) {
          document.getElementById("btn-upload-avatar").textContent =
            "✓ Фото загружено";
          document.getElementById("btn-upload-avatar").style.color =
            "var(--primary)";
        }
        profileLoaded = true;
      }
    }

    // Stats
    document.getElementById("stat-online").innerText = data.activeSessions || 0;
    document.getElementById("stat-chats").innerText = data.totalAllChats || data.globalChats || 0;
    document.getElementById("stat-letters").innerText = data.totalAllLetters || data.globalLetters || 0;

    // Обновляем график
    updateActivityChart(data.activeSessions || 0);

    // Role badge
    const roleNames = {
      superadmin: "Босс",
      admin: "Админ",
      team: "Команда",
      translator: "Переводчик",
      top: "Топ",
    };
    const badge = document.getElementById("user-role-badge");
    badge.innerText = roleNames[data.role] || data.role;
    badge.style.display = "inline-flex";
    
    // Сохраняем роль глобально для использования в других функциях
    window.currentUserRole = data.role;

    // Проверка на принудительную смену имени (is_renamed === 0 для ВСЕХ ролей)
    window.forceRenameMode = false;
    if (data.profile && data.profile.is_renamed === 0) {
      window.forceRenameMode = true;
      window.originalForceNickname = data.profile.nickname;

      const overlay = document.getElementById("profile-modal-overlay");
      overlay.style.display = "flex";

      // Явно показываем модальную панель (CSS анимация modalIn может блокировать)
      const modalPanel = overlay.querySelector(".modal-panel");
      if (modalPanel) {
        modalPanel.style.opacity = "1";
        modalPanel.style.transform = "none";
        modalPanel.style.animation = "none";
      }
      
      const closeBtn = document.querySelector("#profile-modal-overlay .modal-close");
      if (closeBtn) closeBtn.style.display = "none";
      
      let warning = document.getElementById("force-rename-warning");
      if (!warning) {
        warning = document.createElement("div");
        warning.id = "force-rename-warning";
        warning.style.cssText = "background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 10px; border-radius: 8px; margin-bottom: 15px; text-align: center; font-weight: bold; border: 1px solid #ef4444;";
        warning.innerText = "⚠️ Вам необходимо задать своё реальное Имя / Инфо перед началом работы!";
        const profileLayout = document.querySelector(".profile-layout").parentNode;
        profileLayout.insertBefore(warning, profileLayout.firstChild);
      }
      warning.style.display = "block";
    } else {
      const closeBtn = document.querySelector("#profile-modal-overlay .modal-close");
      if (closeBtn) closeBtn.style.display = "block";
      const warning = document.getElementById("force-rename-warning");
      if (warning) warning.style.display = "none";
    }

    // Show users menu item for admin/superadmin
    const menuUsers = document.getElementById("menu-users");
    if (menuUsers) {
      menuUsers.style.display = (data.role === "admin" || data.role === "superadmin") ? "block" : "none";
    }

    // Show/hide create keys button based on role
    const createKeysBtn = document.getElementById("btn-create-keys-modal");
    if (createKeysBtn) {
      createKeysBtn.style.display = 
        (data.role === "admin" || data.role === "superadmin") ? "inline-flex" : "none";
    }

    // Показываем фильтр команд для роли "Топ"
    if (data.role === "top" && data.teams) {
      toggleTopTeamFilter(true, data.teams);
    } else {
      toggleTopTeamFilter(false);
    }

    // Superadmin extras
    if (data.role === "superadmin") {
      document.getElementById("superadmin-panel").style.display = "block";
      document.getElementById("team-select-group").style.display = "block";
      const teamSelect = document.getElementById("key-team-owner");
      
      // Очищаем селект и заполняем заново каждый раз
      teamSelect.innerHTML = '<option value="me">Оставить себе</option>';
      
      if (data.users) {
        data.users
          .filter((u) => u.role === "team")
          .forEach((team) => {
            const opt = document.createElement("option");
            opt.value = team.id;
            opt.text = `Команда: ${team.nickname || team.username}`;
            teamSelect.add(opt);
          });
      }
    }

    // Populate tables
    populateDashboardTable(data);
    populateLicensesTable(data);
    
  } catch (e) {
    console.error("Ошибка обновления:", e);
  }
}

// ─── POPULATE DASHBOARD TABLE (ONLINE ONLY) ───────────
function populateDashboardTable(data) {
  const tbody = document.getElementById("dashboard-active-table");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  if (!data.operators || data.operators.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-3); padding:32px;">У вас нет активных ключей</td></tr>`;
    return;
  }
  
  // Фильтруем только онлайн операторов
  const onlineOperators = data.operators.filter(op => op.isOnline);
  
  if (onlineOperators.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-3); padding:32px;">Нет активных операторов онлайн</td></tr>`;
    return;
  }
  
  onlineOperators.forEach((op) => {
    const days = Math.floor(op.expSec / 86400);
    const hours = Math.floor((op.expSec % 86400) / 3600);
    const timeClass = days < 1 ? "time-crit" : days < 3 ? "time-warn" : "time-ok";

    // Статистика чатов и писем — показываем сразу слева от "Инфо"
    const chatCount = op.details?.stats?.chat || 0;
    const letterCount = op.details?.stats?.letters || 0;
    const statsHtml = `<span style="font-size:12px; color:var(--text-2); white-space:nowrap;">💬 <b style="color:var(--info);">${chatCount}</b>&nbsp;&nbsp;✉️ <b style="color:var(--secondary);">${letterCount}</b></span>`;

    const infoBtn = `<button class="btn btn-icon" onclick="showOpDetails('${op.keyHash}')">Инфо</button>`;

    const tr = document.createElement("tr");
    tr.className = 'key-row status-online';
    tr.innerHTML = `
      <td><span class="dot online"></span></td>
      <td><strong>${op.operatorId || "Без имени"}</strong></td>
      <td><span class="${timeClass}">${days}д ${hours}ч</span></td>
      <td>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${statsHtml}
          ${infoBtn}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── POPULATE LICENSES TABLE (ALL KEYS) ────────────────
function populateLicensesTable(data) {
  const tbody = document.getElementById("licenses-table");
  if (!tbody) return;
  
  tbody.innerHTML = "";

  if (!data.operators || data.operators.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-3); padding:32px;">У вас нет активных ключей</td></tr>`;
    return;
  }
  
  // Для роли "Топ" используем специальную функцию отрисовки с фильтрацией
  if (data.role === "top") {
    renderFilteredKeys();
    return;
  }

  // Подсчет для фильтров
  let onlineCount = 0;
  let offlineCount = 0;

  data.operators.forEach((op) => {
    const days = Math.floor(op.expSec / 86400);
    const hours = Math.floor((op.expSec % 86400) / 3600);
    const timeClass =
      days < 1 ? "time-crit" : days < 3 ? "time-warn" : "time-ok";

    const infoBtn = op.isOnline
      ? `<button class="btn btn-icon" onclick="showOpDetails('${op.keyHash}')">Инфо</button>`
      : "";

    const renewBtn =
      data.role === "superadmin"
        ? `<button class="btn btn-success" onclick="renewLicense('${op.keyHash}')">Продлить</button>`
        : "";

    const killBtn =
      data.role !== "translator"
        ? `<button class="btn btn-danger" onclick="kickUser('${op.keyHash}')">Удалить</button>`
        : "";

    // Подсчет статусов
    if (op.isOnline) onlineCount++;
    else offlineCount++;

    const tr = document.createElement("tr");
    tr.className = `key-row ${op.isOnline ? 'status-online' : 'status-offline'}`;
    tr.setAttribute("data-team-id", op.creatorId || "");
    tr.innerHTML = `
      <td><span class="dot ${op.isOnline ? "online" : "offline"}"></span></td>
      <td><strong>${op.operatorId || "Без имени"}</strong></td>
      <td><span class="${timeClass}">${days}д ${hours}ч</span></td>
      <td>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${infoBtn}
          ${renewBtn}
          ${killBtn}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Обновляем счетчики фильтров
  document.getElementById("filter-count-all").textContent = data.operators.length;
  document.getElementById("filter-count-online").textContent = onlineCount;
  document.getElementById("filter-count-offline").textContent = offlineCount;

  // Применяем текущий фильтр
  filterKeysTable();
}

// ─── USERS LIST ───────────────────────────────────────
async function fetchUsersList() {
  try {
    const res = await fetch("/admin/api/all_users", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status !== 200) return;
    const data = await res.json();

    const tbody = document.getElementById("all-users-table");
    tbody.innerHTML = "";
    if (!data.users || data.users.length === 0) return;

    const roleBadge = {
      superadmin: '<span class="rb rb-boss">👑 Босс</span>',
      admin: '<span class="rb rb-admin">🛡 Админ</span>',
      team: '<span class="rb rb-team">🏢 Команда</span>',
      translator: '<span class="rb rb-transl">💻 Переводчик</span>',
      top: '<span class="rb rb-top">⭐ Топ</span>',
    };

    data.users.forEach((u) => {
      const avatar = u.avatar || getEmojiAvatar(u.nickname || u.username || "U");
      const tg = u.telegram
        ? `<a href="https://t.me/${u.telegram}" target="_blank" class="tg-link">@${u.telegram}</a>`
        : `<span style="color:var(--text-3);font-size:12px;">Не указан</span>`;

      let relHtml = '<span style="color:var(--text-3)">—</span>';
      if (u.role === "translator") {
        const lic = data.licenses.find((l) => l.translator_id === u.id);
        if (lic) {
          const team = data.users.find((tu) => tu.id === lic.creator_id);
          
          // Если ключ привязан к команде, не показываем его в общей таблице пользователей
          if (team && team.role === "team") return;
          
          const tName = team ? team.nickname || team.username : "Неизвестно";
          relHtml = `
                        <div style="font-size:12px; margin-bottom:3px;">ID: <span style="font-family:monospace; color:var(--secondary);" title="ID ключа (хеш)">${lic.key_hash.substring(0, 8).toUpperCase()}…</span></div>
                        <div style="font-size:11px; color:var(--text-3);">К: <b style="color:var(--info);">${tName}</b></div>
                    `;
        }
      } else if (u.role === "team" || u.role === "superadmin") {
        const cnt = data.licenses.filter((l) => l.creator_id === u.id).length;
        relHtml = `<span style="color:var(--primary); font-weight:700; font-size:12px;">Выдано ключей: ${cnt}</span>`;
      } else if (u.role === "top") {
        // Для роли "Топ" показываем количество привязанных команд
        relHtml = `<span style="color:var(--secondary); font-weight:700; font-size:12px;">👥 Наблюдает за командами</span>`;
      }

      const actions =
        data.role === "superadmin"
          ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">
                       <button class="btn btn-icon" onclick="changeUserPass(${u.id},'${u.username}')">Пароль</button>
                       ${u.role === "team" ? `<button class="btn btn-secondary" onclick="viewTeamKeys(${u.id},'${(u.nickname || u.username).replace(/'/g, "\\'")}')">Ключи</button>` : ""}
                       ${u.role === "top" ? `<button class="btn btn-secondary" onclick="manageTopTeams(${u.id},'${u.username}')">Команды</button>` : ""}
                       ${u.role !== "superadmin" ? `<button class="btn btn-danger" onclick="deleteUserProfile(${u.id},'${u.username}')">Удалить</button>` : ""}
                   </div>`
          : `<span style="color:var(--text-3); font-size:11px;">—</span>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <img src="${avatar}" alt="avatar" onerror="this.src='https://via.placeholder.com/36'">
                        <div>
                            <div class="uc-name">${u.nickname || "Без имени"}</div>
                            <div class="uc-login">${u.username}</div>
                        </div>
                    </div>
                </td>
                <td>${tg}</td>
                <td>${roleBadge[u.role] || u.role}</td>
                <td>${relHtml}</td>
                <td>${actions}</td>
            `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Ошибка загрузки пользователей:", e);
  }
}

// ─── GENERATE KEYS ────────────────────────────────────
document.getElementById("btn-generate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.innerText = "Генерация...";

  const count = document.getElementById("key-count").value;
  const days = document.getElementById("key-duration").value;
  const note = document.getElementById("key-note").value;
  const ownerId = document.getElementById("key-team-owner")?.value;

  try {
    const res = await fetch("/admin/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ count, days, note, ownerId }),
    });
    const data = await res.json();

    if (data.success) {
      generatedKeysData = data.keys;

      // Show download box
      const resultBox = document.getElementById("new-key-result");
      const countLabel = document.getElementById("key-result-count");
      countLabel.innerText = `${data.keys.length} шт.`;
      resultBox.style.display = "block";

      fetchDashboard();
      showToast(`Сгенерировано ${data.keys.length} ключ(ей)!`);
      
      // НЕ закрываем модалку автоматически - пользователь должен скачать ключи
    } else {
      showToast(data.error || "Ошибка генерации", true);
    }
  } catch {
    showToast("Ошибка сети!", true);
  } finally {
    btn.disabled = false;
    btn.innerText = "Сгенерировать ключи";
  }
});

// ─── DOWNLOAD KEYS FILE ───────────────────────────────
document.getElementById("btn-download-keys").addEventListener("click", () => {
  if (!generatedKeysData || generatedKeysData.length === 0) {
    showToast("Нет ключей для скачивания", true);
    return;
  }

  const note = document.getElementById("key-note").value || "без_имени";
  const duration =
    document.getElementById("key-duration").options[
      document.getElementById("key-duration").selectedIndex
    ].text;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU");
  const timeStr = now.toLocaleTimeString("ru-RU");

  let content = "";
  content += "╔══════════════════════════════════════════════════╗\n";
  content += "║           SNATCH — ЛИЦЕНЗИОННЫЕ КЛЮЧИ            ║\n";
  content += "╚══════════════════════════════════════════════════╝\n\n";
  content += `  Сгенерировано : ${dateStr} в ${timeStr}\n`;
  content += `  Примечание    : ${note}\n`;
  content += `  Срок действия : ${duration}\n`;
  content += `  Количество    : ${generatedKeysData.length} шт.\n\n`;
  content += "══════════════════════════════════════════════════\n\n";

  generatedKeysData.forEach((k, i) => {
    content += `  #${String(i + 1).padStart(2, "0")} ─────────────────────────────────────────\n`;
    content += `  Ключ для бота : ${k.key}\n`;
    content += `  Логин         : ${k.login}\n`;
    content += `  Пароль        : ${k.password}\n`;
    content += "\n";
  });

  content += "══════════════════════════════════════════════════\n";
  content += "  Snatch Admin Panel\n";

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = note.replace(/[^а-яёa-z0-9_\-]/gi, "_").substring(0, 30);
  a.href = url;
  a.download = `snatch_keys_${safeName}_${now.toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast("Ключи скачаны!");
  
  // Закрываем модалку и сбрасываем форму после скачивания
  setTimeout(() => {
    document.getElementById("create-keys-modal").style.display = "none";
    document.getElementById("new-key-result").style.display = "none";
    document.getElementById("key-note").value = "";
    document.getElementById("key-count").value = "1";
    generatedKeysData = null;
  }, 1000);
});

// ─── CREATE USER ─────────────────────────────────────
document
  .getElementById("btn-create-user")
  ?.addEventListener("click", async () => {
    const username = document.getElementById("new-user-name").value.trim();
    const password = document.getElementById("new-user-pass").value;
    const role = document.getElementById("new-user-role").value;

    if (!username || !password) {
      showToast("Заполните все поля!", true);
      return;
    }

    try {
      const res = await fetch("/admin/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Пользователь ${username} создан!`);
        document.getElementById("new-user-name").value = "";
        document.getElementById("new-user-pass").value = "";
        fetchDashboard();
        fetchUsersList();
      } else {
        showToast(data.error || "Ошибка создания", true);
      }
    } catch {
      showToast("Ошибка сети!", true);
    }
  });

// ─── KICK / DELETE KEY (ЧЕРЕЗ КРАСИВУЮ МОДАЛКУ) ─────────
let pendingRevokeHash = null;

window.kickUser = function (hash) {
  pendingRevokeHash = hash;
  document.getElementById("confirmToast").style.display = "flex";
};

// ─── RENEW LICENSE ────────────────────────────────────
window.renewLicense = async function (hash) {
  const options = [
    { label: "3 дня", days: 3 },
    { label: "7 дней", days: 7 },
    { label: "14 дней", days: 14 },
    { label: "30 дней", days: 30 },
    { label: "60 дней", days: 60 },
    { label: "90 дней", days: 90 },
  ];

  // Create modal
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1e293b);border:1px solid var(--border,#334155);border-radius:12px;padding:28px 32px;min-width:280px;max-width:360px;text-align:center;">
      <h3 style="margin:0 0 16px;color:var(--text-1,#f1f5f9);font-size:16px;">Продлить лицензию</h3>
      <p style="color:var(--text-3,#94a3b8);font-size:13px;margin:0 0 20px;">Выберите срок продления:</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
        ${options.map(o => `<button class="renew-opt-btn" data-days="${o.days}" style="padding:10px 8px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-hover,#0f172a);color:var(--text-1,#f1f5f9);cursor:pointer;font-size:14px;transition:all 0.15s;">${o.label}</button>`).join("")}
      </div>
      <button id="renew-cancel" style="padding:8px 24px;border-radius:8px;border:1px solid var(--border,#334155);background:transparent;color:var(--text-3,#94a3b8);cursor:pointer;font-size:13px;">Отмена</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll(".renew-opt-btn").forEach(btn => {
    btn.addEventListener("mouseenter", () => { btn.style.background = "var(--primary,#3b82f6)"; btn.style.color = "#fff"; btn.style.borderColor = "var(--primary,#3b82f6)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "var(--bg-hover,#0f172a)"; btn.style.color = "var(--text-1,#f1f5f9)"; btn.style.borderColor = "var(--border,#334155)"; });
    btn.addEventListener("click", async () => {
      const days = parseInt(btn.dataset.days);
      document.body.removeChild(overlay);
      try {
        const res = await fetch("/api/extend", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ keyHash: hash, days }),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Лицензия продлена на ${days} дней!`);
          fetchDashboard();
        } else {
          showToast("Ошибка: " + (data.error || "Нет доступа"), true);
        }
      } catch {
        showToast("Ошибка сети!", true);
      }
    });
  });
  document.getElementById("renew-cancel").addEventListener("click", () => document.body.removeChild(overlay));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
};

// Обработчики кнопок модалки
document.getElementById("toastCancel").addEventListener("click", () => {
  document.getElementById("confirmToast").style.display = "none";
  pendingRevokeHash = null;
});

document.getElementById("toastConfirm").addEventListener("click", async () => {
  if (!pendingRevokeHash) return;
  try {
    await fetch("/admin/api/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ hash: pendingRevokeHash }),
    });
    fetchDashboard();
    showToast("Ключ удалён");
  } catch {
    showToast("Ошибка при удалении!", true);
  } finally {
    document.getElementById("confirmToast").style.display = "none";
    pendingRevokeHash = null;
  }
});

// ─── CHANGE PASSWORD ─────────────────────────────────
window.changeUserPass = async function (userId, username) {
  const newPass = prompt(`Новый пароль для пользователя ${username}:`);
  if (!newPass) return;
  try {
    const res = await fetch("/admin/api/force_password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ userId, newPassword: newPass }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Пароль для ${username} изменён!`);
    } else {
      showToast("Ошибка: " + (data.error || "Неизвестная"), true);
    }
  } catch {
    showToast("Ошибка сети!", true);
  }
};

// ─── DELETE USER ─────────────────────────────────────
window.deleteUserProfile = async function (userId, username) {
  if (
    !confirm(
      `⚠️ Удалить пользователя "${username}" навсегда?\n\nВсе его ключи будут удалены.`,
    )
  )
    return;
  try {
    const res = await fetch("/admin/api/delete_user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Пользователь ${username} удалён!`);
      fetchUsersList();
      fetchDashboard();
    } else {
      showToast("Ошибка: " + (data.error || "Неизвестная"), true);
    }
  } catch {
    showToast("Ошибка сети!", true);
  }
};

// ─── OPERATOR DETAILS MODAL ──────────────────────────
window.showOpDetails = function (hash) {
  const op = window.currentOperatorsData.find((o) => o.keyHash === hash);
  if (!op || !op.details) return;

  const { config, stats, rotationState } = op.details;
  
  // Helper functions
  function formatTime(minutes) {
    if (!minutes || minutes <= 0) return 'Неизвестно';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
  }
  
  function formatRemainingTime(durationMinutes, elapsedMs) {
    const totalMs = durationMinutes * 60 * 1000;
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    const remainingMinutes = Math.floor(remainingMs / 60000);
    const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
    return remainingMinutes > 0 ? `${remainingMinutes}м ${remainingSeconds}с` : `${remainingSeconds}с`;
  }

  // Build rotation tab content - MORE COMPACT
  let rotationHtml = `
    <div style="padding:0 20px 20px;">
      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <div style="flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:12px; text-align:center;">
          <div style="font-size:10px; color:var(--text-3); margin-bottom:4px; font-weight:600; text-transform:uppercase;">Чатов</div>
          <div style="font-size:22px; font-weight:700; color:var(--info);">${stats.chat}</div>
        </div>
        <div style="flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:12px; text-align:center;">
          <div style="font-size:10px; color:var(--text-3); margin-bottom:4px; font-weight:600; text-transform:uppercase;">Писем</div>
          <div style="font-size:22px; font-weight:700; color:var(--secondary);">${stats.letters}</div>
        </div>
      </div>
  `;

  let hasRotation = false;
  
  // Check for active rotations - MORE COMPACT
  Object.keys(rotationState || {}).forEach(key => {
    const state = rotationState[key];
    const [type, girlId, category] = key.split('_');
    
    let items = [];
    let title = '';
    let icon = '';
    let color = 'var(--primary)';
    
    if (type === 'invite') {
      const invKey = girlId === 'global' ? 'invites' : `invites${girlId}`;
      items = config[invKey]?.[category] || [];
      title = `${girlId === 'global' ? 'Глобал' : `ID ${girlId}`} • [${category}]`;
      icon = '💬';
    } else if (type === 'letter') {
      items = config.letters?.[girlId] || [];
      title = `${girlId === 'global' ? 'Глобал' : `ID ${girlId}`} • Письма`;
      icon = '✉️';
      color = 'var(--secondary)';
    }
    
    if (items.length > 0 && state.index < items.length) {
      hasRotation = true;
      const currentItem = items[state.index];
      const text = typeof currentItem === 'string' ? currentItem : currentItem.text || '[Только медиа]';
      const duration = typeof currentItem === 'object' ? currentItem.duration : 60;
      const remaining = formatRemainingTime(duration, state.elapsedMs || 0);
      
      rotationHtml += `
        <div style="background:var(--surface2); border-left:3px solid ${color}; border-radius:var(--radius); padding:12px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
            <div style="font-size:12px; color:var(--text); font-weight:600;">${icon} ${title}</div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
              <span style="background:${color}; color:white; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600;">${formatTime(duration)}</span>
              <span style="background:var(--surface3); color:var(--text-2); padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600;">⏳ ${remaining}</span>
            </div>
          </div>
          <div style="background:var(--surface); padding:10px; border-radius:var(--radius); font-size:13px; line-height:1.5; color:var(--text-2); max-height:80px; overflow-y:auto;">${text}</div>
          <div style="margin-top:6px; font-size:10px; color:var(--text-3);">
            <span style="display:inline-block; width:5px; height:5px; background:${color}; border-radius:50%; margin-right:5px;"></span>
            ${state.index + 1} из ${items.length}
          </div>
        </div>
      `;
    }
  });
  
  if (!hasRotation) {
    rotationHtml += `<div style="text-align:center; padding:30px; color:var(--text-3); font-style:italic; font-size:13px;">Нет активной ротации</div>`;
  }
  
  rotationHtml += `</div>`;

  // Build settings tab content - MORE COMPACT
  let settingsHtml = '<div style="padding:0 20px 20px;">';
  
  const profiles = new Set();
  if (config.letters) Object.keys(config.letters).forEach(k => k !== 'global' && profiles.add(k));
  Object.keys(config).forEach(k => {
    if (k.startsWith('invites') && k !== 'invites') profiles.add(k.replace('invites', ''));
  });
  if ((config.invites && Object.keys(config.invites).length > 0) || (config.letters?.global)) {
    profiles.add('global');
  }

  if (profiles.size === 0) {
    settingsHtml += `<div style="text-align:center; padding:30px; color:var(--text-3); font-style:italic; font-size:13px;">Настройки не заданы</div>`;
  }

  profiles.forEach(pid => {
    const invKey = pid === 'global' ? 'invites' : `invites${pid}`;
    const title = pid === 'global' ? '🌐 Глобал' : `👤 ID: ${pid}`;
    
    let invCount = 0, letCount = 0;
    let invHtml = '', letHtml = '';
    
    if (config[invKey]) {
      Object.keys(config[invKey]).forEach(cat => {
        const items = config[invKey][cat];
        if (items?.length) {
          invCount += items.length;
          items.forEach((it, idx) => {
            const text = typeof it === 'string' ? it : it.text || '[Только медиа]';
            const duration = typeof it === 'object' ? it.duration : 60;
            invHtml += `
              <div style="background:var(--surface); padding:8px; border-radius:var(--radius); margin-bottom:6px; font-size:12px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <b style="color:var(--primary); font-size:10px;">[${cat}] #${idx + 1}</b>
                  <span style="font-size:9px; color:var(--text-3);">${formatTime(duration)}</span>
                </div>
                <div style="color:var(--text-2); line-height:1.4; font-size:11px;">${text.substring(0, 80)}${text.length > 80 ? '...' : ''}</div>
              </div>
            `;
          });
        }
      });
    }
    
    if (config.letters?.[pid]) {
      config.letters[pid].forEach((it, idx) => {
        const text = typeof it === 'string' ? it : it.text || '[Только медиа]';
        const duration = typeof it === 'object' ? it.duration : 60;
        letCount++;
        letHtml += `
          <div style="background:var(--surface); padding:8px; border-radius:var(--radius); margin-bottom:6px; font-size:12px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <b style="color:var(--secondary); font-size:10px;">Письмо #${idx + 1}</b>
              <span style="font-size:9px; color:var(--text-3);">${formatTime(duration)}</span>
            </div>
            <div style="color:var(--text-2); line-height:1.4; font-size:11px;">${text.substring(0, 80)}${text.length > 80 ? '...' : ''}</div>
          </div>
        `;
      });
    }
    
    if (invCount > 0 || letCount > 0) {
      settingsHtml += `
        <div style="border:1px solid var(--border); background:var(--surface2); border-radius:var(--radius); padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0; font-size:13px; font-weight:600;">${title}</h4>
            <div style="font-size:10px; color:var(--text-3);">
              💬 <b style="color:var(--primary);">${invCount}</b> | ✉️ <b style="color:var(--secondary);">${letCount}</b>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div style="max-height:250px; overflow-y:auto;">
              <div style="font-size:10px; color:var(--text-3); font-weight:600; margin-bottom:6px; text-transform:uppercase;">Инвайты</div>
              ${invHtml || '<div style="color:var(--text-3); font-style:italic; font-size:11px;">Не настроено</div>'}
            </div>
            <div style="max-height:250px; overflow-y:auto;">
              <div style="font-size:10px; color:var(--text-3); font-weight:600; margin-bottom:6px; text-transform:uppercase;">Письма</div>
              ${letHtml || '<div style="color:var(--text-3); font-style:italic; font-size:11px;">Не настроено</div>'}
            </div>
          </div>
        </div>
      `;
    }
  });
  
  settingsHtml += '</div>';

  // Update modal
  document.getElementById('op-modal-title').innerText = `${op.operatorId || 'Без имени'}`;
  document.getElementById('tab-rotation').innerHTML = rotationHtml;
  document.getElementById('tab-settings').innerHTML = settingsHtml;
  
  // Reset tabs to first
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.modal-tab[data-tab="rotation"]')?.classList.add('active');
  document.getElementById('tab-rotation')?.classList.add('active');
  
  document.getElementById('op-modal-overlay').style.display = 'flex';
};

// Close modal on overlay click
document
  .getElementById("op-modal-overlay")
  .addEventListener("click", function (e) {
    if (e.target === this) this.style.display = "none";
  });

// ─── TOAST NOTIFICATIONS ─────────────────────────────
function showToast(msg, isError = false) {
  const existing = document.querySelector(".snatch-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "snatch-toast";
  toast.innerText = msg;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: isError ? "var(--danger)" : "var(--primary)",
    color: isError ? "#fff" : "#000",
    padding: "12px 22px",
    borderRadius: "12px",
    fontFamily: "'Syne', sans-serif",
    fontWeight: "700",
    fontSize: "14px",
    zIndex: "99999",
    boxShadow: "0 8px 30px rgba(0,0,0,.4)",
    animation: "fadeUp .3s ease-out both",
    maxWidth: "320px",
    lineHeight: "1.4",
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "all .3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


// Отрисовка графика активности
function updateActivityChart(activeCount) {
  const ctx = document.getElementById("activityChart");
  if (!ctx) return;

  // Обновляем текущее значение в заголовке графика
  const currentValueEl = document.getElementById("chart-current-value");
  if (currentValueEl) {
    currentValueEl.textContent = activeCount;
  }

  const now = new Date();
  const ts = now.getTime();
  const timeStr =
    now.getHours().toString().padStart(2, "0") +
    ":" +
    now.getMinutes().toString().padStart(2, "0");

  // Добавляем новую точку
  chartPoints.push({ ts, label: timeStr, value: activeCount });
  chartLabels.push(timeStr);
  chartData.push(activeCount);

  // Держим только последние 20 минут (20 точек при обновлении раз в минуту)
  const cutoff = ts - 20 * 60 * 1000;
  while (chartPoints.length > 0 && chartPoints[0].ts < cutoff) {
    chartPoints.shift();
    chartLabels.shift();
    chartData.shift();
  }
  // Дополнительный лимит на случай частых обновлений
  if (chartPoints.length > 20) {
    const excess = chartPoints.length - 20;
    chartPoints.splice(0, excess);
    chartLabels.splice(0, excess);
    chartData.splice(0, excess);
  }

  // Сохраняем в sessionStorage — переживёт перезагрузку страницы
  saveChartToStorage(chartPoints);

  // Определяем тему для цветов
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const primaryColor = isDark ? "#3b82f6" : "#2563eb";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const textColor = isDark ? "#cbd5e1" : "#475569";
  
  // Создаем градиент для заливки
  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, isDark ? "rgba(59,130,246,0.3)" : "rgba(37,99,235,0.2)");
  gradient.addColorStop(1, isDark ? "rgba(59,130,246,0.01)" : "rgba(37,99,235,0.01)");

  if (activityChart) {
    // Обновляем цвета при смене темы
    activityChart.data.datasets[0].borderColor = primaryColor;
    activityChart.data.datasets[0].backgroundColor = gradient;
    activityChart.data.datasets[0].pointBackgroundColor = primaryColor;
    activityChart.data.datasets[0].pointBorderColor = isDark ? "#1e293b" : "#ffffff";
    activityChart.options.scales.x.grid.color = gridColor;
    activityChart.options.scales.y.grid.color = gridColor;
    activityChart.options.scales.x.ticks.color = textColor;
    activityChart.options.scales.y.ticks.color = textColor;
    activityChart.update();
  } else {
    activityChart = new Chart(ctx.getContext("2d"), {
      type: "line",
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: "Активных сессий",
            data: chartData,
            borderColor: primaryColor,
            backgroundColor: gradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: primaryColor,
            pointBorderColor: isDark ? "#1e293b" : "#ffffff",
            pointBorderWidth: 2,
            pointHoverBackgroundColor: primaryColor,
            pointHoverBorderColor: isDark ? "#1e293b" : "#ffffff",
            pointHoverBorderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { 
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: textColor,
              font: {
                size: 12,
                weight: '500',
                family: 'Inter'
              },
              padding: 15,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: isDark ? "rgba(30,41,59,0.95)" : "rgba(255,255,255,0.95)",
            titleColor: textColor,
            bodyColor: textColor,
            borderColor: isDark ? "#334155" : "#e2e8f0",
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              title: function(context) {
                return `Время: ${context[0].label}`;
              },
              label: function(context) {
                const value = context.parsed.y;
                const plural = value === 1 ? 'сессия' : (value < 5 ? 'сессии' : 'сессий');
                return `${value} ${plural} онлайн`;
              },
              afterLabel: function(context) {
                const index = context.dataIndex;
                if (index > 0) {
                  const prev = chartData[index - 1];
                  const curr = context.parsed.y;
                  const diff = curr - prev;
                  if (diff > 0) return `↑ +${diff} с предыдущей минуты`;
                  if (diff < 0) return `↓ ${diff} с предыдущей минуты`;
                  return '— без изменений';
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: true,
              color: gridColor,
              drawBorder: false,
            },
            ticks: {
              color: textColor,
              font: {
                size: 11,
                family: 'Inter'
              },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(5, Math.max(...chartData) + 2),
            grid: {
              display: true,
              color: gridColor,
              drawBorder: false,
            },
            ticks: {
              color: textColor,
              font: {
                size: 11,
                family: 'Inter'
              },
              stepSize: 1,
              callback: function(value) {
                return Number.isInteger(value) ? value : '';
              }
            }
          },
        },
        animation: { 
          duration: 500,
          easing: 'easeInOutQuart'
        },
      },
    });
  }
}

// ─── INIT ─────────────────────────────────────────────
checkAuthState();

// ─── MODAL HANDLERS ───────────────────────────────────
// Reset create keys modal on close
function resetCreateKeysModal() {
  document.getElementById("new-key-result").style.display = "none";
  document.getElementById("key-note").value = "";
  document.getElementById("key-count").value = "1";
  generatedKeysData = null;
}

// Close create keys modal on overlay click
document.getElementById("create-keys-modal")?.addEventListener("click", function(e) {
  if (e.target === this) {
    this.style.display = "none";
    resetCreateKeysModal();
  }
});

// Override close button to reset form
const createKeysCloseBtn = document.querySelector("#create-keys-modal .modal-close");
if (createKeysCloseBtn) {
  createKeysCloseBtn.onclick = function() {
    document.getElementById("create-keys-modal").style.display = "none";
    resetCreateKeysModal();
  };
}

// Close profile modal on overlay click
document.getElementById("profile-modal-overlay")?.addEventListener("click", function(e) {
  if (e.target === this) {
    if (window.forceRenameMode) return;
    this.style.display = "none";
  }
});
