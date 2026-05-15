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
document.getElementById("menu-mans")?.addEventListener("click", () => switchView("mans"));

let currentFilter = "all"; // Текущий фильтр таблицы

function switchView(view) {
  // Update content visibility
  document.getElementById("view-dashboard").style.display = "none";
  document.getElementById("view-licenses").style.display = "none";
  document.getElementById("view-users").style.display = "none";
  const mansView = document.getElementById("view-mans");
  if (mansView) mansView.style.display = "none";
  
  if (view === "dashboard") {
    document.getElementById("view-dashboard").style.display = "block";
  } else if (view === "licenses") {
    document.getElementById("view-licenses").style.display = "block";
  } else if (view === "users") {
    document.getElementById("view-users").style.display = "block";
    fetchUsersList();
  } else if (view === "mans") {
    if (mansView) mansView.style.display = "block";
    fetchMansList();
  }
  
  // Update sidebar active state
  document.querySelectorAll(".sidebar-item").forEach(item => item.classList.remove("active"));
  if (view === "dashboard") document.getElementById("menu-dashboard")?.classList.add("active");
  if (view === "licenses") document.getElementById("menu-licenses")?.classList.add("active");
  if (view === "users") document.getElementById("menu-users")?.classList.add("active");
  if (view === "mans") document.getElementById("menu-mans")?.classList.add("active");
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
    // stat-total-keys — количество всех лицензий
    const totalKeysEl = document.getElementById("stat-total-keys");
    if (totalKeysEl) totalKeysEl.innerText = (data.operators || []).length;

    // Обновляем аватар и имя в сайдбаре (sb-avatar, sb-nickname)
    if (data.profile) {
      const avatarUrl = data.profile.avatar || getEmojiAvatar(data.profile.nickname || data.profile.username || "U");
      const nick = data.profile.nickname || "Без имени";
      const sbAvatar = document.getElementById("sb-avatar");
      const sbNick = document.getElementById("sb-nickname");
      if (sbAvatar) sbAvatar.src = avatarUrl;
      if (sbNick) sbNick.textContent = nick;
      // Роль в сайдбаре
      const roleLabels = { superadmin: "CEO / Супер", admin: "Администратор", team: "Команда", translator: "Переводчик", top: "Топ менеджер" };
      const sbRole = document.getElementById("sb-role");
      if (sbRole) sbRole.textContent = roleLabels[data.role] || data.role;
    }

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

    // Show users/mans menu items for admin/superadmin
    const menuUsers = document.getElementById("menu-users");
    if (menuUsers) {
      menuUsers.style.display = (data.role === "admin" || data.role === "superadmin") ? "block" : "none";
    }
    const menuMans = document.getElementById("menu-mans");
    if (menuMans) {
      menuMans.style.display = (data.role === "admin" || data.role === "superadmin") ? "block" : "none";
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
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">У вас нет активных ключей</td></tr>`;
    return;
  }
  
  // Фильтруем только онлайн операторов
  const onlineOperators = data.operators.filter(op => op.isOnline);
  
  if (onlineOperators.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Нет активных операторов онлайн</td></tr>`;
    return;
  }
  
  onlineOperators.forEach((op) => {
    const days = Math.floor(op.expSec / 86400);
    const hours = Math.floor((op.expSec % 86400) / 3600);
    const timeClass = days < 1 ? "time-crit" : days < 3 ? "time-warn" : "time-ok";

    const todayChats   = op.details?.stats?.chat    ?? 0;
    const todayLetters = op.details?.stats?.letters ?? 0;

    const infoBtn = `<button class="btn btn-icon" onclick="showOpDetails('${op.keyHash}')">Инфо</button>`;
    const renewBtnOnline = data.role === "superadmin"
      ? `<div style="display:flex;gap:4px;"><button class="btn btn-success" onclick="renewLicense('${op.keyHash}')">Продлить</button>
         <button class="btn btn-warning" onclick="decreaseLicense('${op.keyHash}')">Отмена</button></div>`
      : "";

    const tr = document.createElement("tr");
    tr.className = 'key-row status-online';
    tr.innerHTML = `
      <td><span class="dot online"></span></td>
      <td><strong>${op.operatorId || "Без имени"}</strong></td>
      <td><span class="${timeClass}">${days}д ${hours}ч</span></td>
      <td style="text-align:center;"><span class="stat-badge stat-badge-chat">${todayChats}</span></td>
      <td style="text-align:center;"><span class="stat-badge stat-badge-letter">${todayLetters}</span></td>
      <td>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          ${infoBtn}
          ${renewBtnOnline}
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
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">У вас нет активных ключей</td></tr>`;
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
        ? `<div style="display:flex;gap:4px;"><button class="btn btn-success" onclick="renewLicense('${op.keyHash}')">Продлить</button>
           <button class="btn btn-warning" onclick="decreaseLicense('${op.keyHash}')">Отмена</button></div>`
        : "";

    const killBtn =
      data.role !== "translator"
        ? `<button class="btn btn-danger" onclick="kickUser('${op.keyHash}')">Удалить</button>`
        : "";

    const todayChats   = op.isOnline ? (op.details?.stats?.chat    ?? 0) : "—";
    const todayLetters = op.isOnline ? (op.details?.stats?.letters ?? 0) : "—";

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
      <td style="text-align:center;"><span class="stat-badge ${op.isOnline ? 'stat-badge-chat' : 'stat-badge-off'}">${todayChats}</span></td>
      <td style="text-align:center;"><span class="stat-badge ${op.isOnline ? 'stat-badge-letter' : 'stat-badge-off'}">${todayLetters}</span></td>
      <td>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
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
    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Нет пользователей</td></tr>";
      return;
    }

    const roleBadge = {
      superadmin: '<span class="rb rb-boss">👑 Босс</span>',
      admin: '<span class="rb rb-admin">🛡 Админ</span>',
      team: '<span class="rb rb-team">🏢 Команда</span>',
      translator: '<span class="rb rb-transl">💻 Переводчик</span>',
      top: '<span class="rb rb-top">⭐ Топ</span>',
    };

    // 1. Построение дерева
    const userMap = new Map();
    const rootUsers = [];
    
    // Сначала добавляем всех в Map
    data.users.forEach(u => {
      u.children = [];
      u.licenses = data.licenses.filter(l => l.creator_id === u.id);
      userMap.set(u.id, u);
    });

    // Распределяем по родителям
    data.users.forEach(u => {
      // superadmin всегда корень, admin тоже если мы смотрим от лица админа
      if (u.role === "superadmin" || (data.role === "admin" && u.role === "admin")) {
        rootUsers.push(u);
      } else if (u.creator_id && userMap.has(u.creator_id)) {
        userMap.get(u.creator_id).children.push(u);
      } else {
        rootUsers.push(u); // сироты тоже в корень
      }
    });

    // 2. Рекурсивный рендер
    const renderNode = (u, depth = 0, parentId = null) => {
      const avatar = u.avatar || getEmojiAvatar(u.nickname || u.username || "U");
      const tg = u.telegram
        ? `<a href="https://t.me/${u.telegram}" target="_blank" class="tg-link">@${u.telegram}</a>`
        : `<span style="color:var(--text-3);font-size:12px;">Не указан</span>`;

      const hasChildren = u.children && u.children.length > 0;
      const expandIcon = hasChildren 
        ? `<span class="tree-expander" onclick="toggleTreeRow(${u.id}, this)" style="cursor:pointer;display:inline-block;width:20px;text-align:center;font-weight:bold;color:var(--primary);">▼</span>` 
        : `<span style="display:inline-block;width:20px;"></span>`;

      let relHtml = '<span style="color:var(--text-3)">—</span>';
      if (u.role === "translator") {
        const lic = data.licenses.find((l) => l.translator_id === u.id);
        if (lic) {
          relHtml = `<div style="font-size:12px;">ID: <span style="font-family:monospace; color:var(--secondary);" title="ID ключа (хеш)">${lic.key_hash.substring(0, 8).toUpperCase()}…</span></div>`;
        }
      } else if (u.role === "team" || u.role === "superadmin" || u.role === "admin") {
        relHtml = `<span style="color:var(--primary); font-weight:700; font-size:12px;">Ключей/Подчиненных: ${u.licenses.length} / ${u.children.length}</span>`;
      } else if (u.role === "top") {
        relHtml = `<span style="color:var(--secondary); font-weight:700; font-size:12px;">👥 Наблюдатель</span>`;
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
      tr.className = `tree-row ${parentId ? 'tree-child-of-' + parentId : ''}`;
      tr.dataset.id = u.id;
      tr.dataset.parentId = parentId || "";
      tr.style.display = depth > 1 ? "none" : ""; // По умолчанию раскрыт только первый уровень
      
      tr.innerHTML = `
        <td style="padding-left: ${depth * 20 + 10}px">
            <div class="user-cell" style="display:flex;align-items:center;gap:8px;">
                ${expandIcon}
                <img src="${avatar}" alt="avatar" onerror="this.src='https://via.placeholder.com/36'" style="width:36px;height:36px;border-radius:8px;">
                <div>
                    <div class="uc-name" style="font-weight:600;color:var(--text-1);">${u.nickname || "Без имени"}</div>
                    <div class="uc-login" style="font-size:12px;color:var(--text-3);">${u.username}</div>
                </div>
            </div>
        </td>
        <td>${tg}</td>
        <td>${roleBadge[u.role] || u.role}</td>
        <td>${relHtml}</td>
        <td>${actions}</td>
      `;
      tbody.appendChild(tr);

      // Рендерим детей
      if (hasChildren) {
        u.children.forEach(child => renderNode(child, depth + 1, u.id));
      }
    };

    rootUsers.forEach(u => renderNode(u, 0, null));
    
    // Функция для сворачивания/разворачивания
    window.toggleTreeRow = function(id, iconEl) {
      const isExpanded = iconEl.textContent === '▼';
      iconEl.textContent = isExpanded ? '▶' : '▼';
      
      const toggleChildren = (parentId, show) => {
        const children = document.querySelectorAll('.tree-child-of-' + parentId);
        children.forEach(tr => {
          tr.style.display = show ? "" : "none";
          // Если мы скрываем, нужно скрыть и всех потомков рекурсивно
          // Если показываем, смотрим на состояние иконки родителя
          if (!show) {
            const childIcon = tr.querySelector('.tree-expander');
            if (childIcon) childIcon.textContent = '▶';
            toggleChildren(tr.dataset.id, false);
          }
        });
      };
      
      toggleChildren(id, !isExpanded);
    };

    window.expandAllUsers = function() {
      document.querySelectorAll('.tree-row').forEach(tr => tr.style.display = '');
      document.querySelectorAll('.tree-expander').forEach(icon => icon.textContent = '▼');
    };

    window.collapseAllUsers = function() {
      document.querySelectorAll('.tree-row').forEach(tr => {
        // Скрываем все, кроме корня
        if (tr.dataset.parentId) tr.style.display = 'none';
      });
      document.querySelectorAll('.tree-expander').forEach(icon => icon.textContent = '▶');
    };

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

// ─── DECREASE LICENSE (ОТМЕНА ДНЕЙ) ───────────────────
window.decreaseLicense = async function (hash) {
  const options = [
    { label: "1 день", days: 1 },
    { label: "3 дня", days: 3 },
    { label: "7 дней", days: 7 },
    { label: "14 дней", days: 14 },
    { label: "30 дней", days: 30 },
    { label: "60 дней", days: 60 },
  ];

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1e293b);border:1px solid var(--border,#334155);border-radius:12px;padding:28px 32px;min-width:280px;max-width:360px;text-align:center;">
      <h3 style="margin:0 0 16px;color:var(--text-1,#f1f5f9);font-size:16px;">Отменить (снять) дни</h3>
      <p style="color:var(--text-3,#94a3b8);font-size:13px;margin:0 0 20px;">Выберите количество дней для снятия:</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
        ${options.map(o => `<button class="decrease-opt-btn" data-days="${o.days}" style="padding:10px 8px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-hover,#0f172a);color:var(--text-1,#f1f5f9);cursor:pointer;font-size:14px;transition:all 0.15s;">${o.label}</button>`).join("")}
      </div>
      <button id="decrease-cancel" style="padding:8px 24px;border-radius:8px;border:1px solid var(--border,#334155);background:transparent;color:var(--text-3,#94a3b8);cursor:pointer;font-size:13px;">Отмена</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#decrease-cancel").onclick = () => overlay.remove();
  
  overlay.querySelectorAll(".decrease-opt-btn").forEach(btn => {
    btn.onclick = async () => {
      const days = parseInt(btn.dataset.days);
      overlay.remove();
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch("/api/decrease-time", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ keyHash: hash, daysToRemove: days })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ Снято ${days} дней`);
          fetchDashboard();
        } else {
          showToast(data.error || "Ошибка уменьшения времени", true);
        }
      } catch (e) {
        showToast("Ошибка сети", true);
      }
    };
  });
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
  document.getElementById('tab-logs').innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-3);">Нажмите вкладку Logs для загрузки</div>`;
  
  // Reset tabs to first
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.modal-tab[data-tab="rotation"]')?.classList.add('active');
  document.getElementById('tab-rotation')?.classList.add('active');

  // Store current hash for Logs tab lazy-load
  document.getElementById('op-modal-overlay').dataset.currentHash = hash;
  
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

  // Текущее значение в заголовке
  const currentValueEl = document.getElementById("chart-current-value");
  if (currentValueEl) currentValueEl.textContent = activeCount;

  const now = new Date();
  const ts = now.getTime();
  const timeStr =
    now.getHours().toString().padStart(2, "0") + ":" +
    now.getMinutes().toString().padStart(2, "0");

  // Добавляем точку
  chartPoints.push({ ts, label: timeStr, value: activeCount });
  chartLabels.push(timeStr);
  chartData.push(activeCount);

  // Оставляем только последние 20 минут / 20 точек
  const cutoff = ts - 20 * 60 * 1000;
  while (chartPoints.length > 0 && chartPoints[0].ts < cutoff) {
    chartPoints.shift(); chartLabels.shift(); chartData.shift();
  }
  if (chartPoints.length > 20) {
    const excess = chartPoints.length - 20;
    chartPoints.splice(0, excess);
    chartLabels.splice(0, excess);
    chartData.splice(0, excess);
  }

  saveChartToStorage(chartPoints);

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const primaryColor = isDark ? "#4f8ef7" : "#2563eb";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
  const textColor = isDark ? "#7a95b8" : "#475569";

  // Безопасный suggestedMax — защита от пустого массива
  const maxVal = chartData.length > 0 ? Math.max(...chartData) : 0;
  const suggestedMax = Math.max(5, isFinite(maxVal) ? maxVal + 2 : 5);

  if (activityChart) {
    // Обновляем данные и цвета — оба сразу
    activityChart.data.labels = chartLabels;
    activityChart.data.datasets[0].data = chartData;

    const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, ctx.offsetHeight || 200);
    gradient.addColorStop(0, isDark ? "rgba(79,142,247,0.28)" : "rgba(37,99,235,0.18)");
    gradient.addColorStop(1, isDark ? "rgba(79,142,247,0.01)" : "rgba(37,99,235,0.01)");

    activityChart.data.datasets[0].borderColor = primaryColor;
    activityChart.data.datasets[0].backgroundColor = gradient;
    activityChart.data.datasets[0].pointBackgroundColor = primaryColor;
    activityChart.data.datasets[0].pointBorderColor = isDark ? "#0f1724" : "#ffffff";
    activityChart.options.scales.x.grid.color = gridColor;
    activityChart.options.scales.y.grid.color = gridColor;
    activityChart.options.scales.x.ticks.color = textColor;
    activityChart.options.scales.y.ticks.color = textColor;
    activityChart.options.scales.y.suggestedMax = suggestedMax;
    activityChart.update("none"); // "none" — без анимации при частых обновлениях
    return;
  }

  // Первичное создание графика
  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, isDark ? "rgba(79,142,247,0.28)" : "rgba(37,99,235,0.18)");
  gradient.addColorStop(1, isDark ? "rgba(79,142,247,0.01)" : "rgba(37,99,235,0.01)");

  activityChart = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: chartLabels,
      datasets: [{
        label: "Онлайн сессий",
        data: chartData,
        borderColor: primaryColor,
        backgroundColor: gradient,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: primaryColor,
        pointBorderColor: isDark ? "#0f1724" : "#ffffff",
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: isDark ? "rgba(15,23,36,0.95)" : "rgba(255,255,255,0.97)",
          titleColor: textColor,
          bodyColor: isDark ? "#dde6f5" : "#0f172a",
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (ctx) => `Время: ${ctx[0].label}`,
            label: (ctx) => {
              const v = ctx.parsed.y;
              const w = v === 1 ? "сессия" : v < 5 ? "сессии" : "сессий";
              return `  ${v} ${w} онлайн`;
            },
            afterLabel: (ctx) => {
              const i = ctx.dataIndex;
              if (i > 0) {
                const diff = ctx.parsed.y - chartData[i - 1];
                if (diff > 0) return `  ↑ +${diff} от предыдущей`;
                if (diff < 0) return `  ↓ ${diff} от предыдущей`;
                return "  — без изменений";
              }
              return "";
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: true, color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11, family: "Outfit, sans-serif" },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax,
          grid: { display: true, color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11, family: "Outfit, sans-serif" },
            stepSize: 1,
            precision: 0,
            callback: (v) => (Number.isInteger(v) ? v : ""),
          },
          border: { display: false },
        },
      },
      animation: { duration: 400, easing: "easeInOutQuart" },
    },
  });
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

// ══════════════════════════════════════════════════════════
// FIX 1: Показать лицензионный ключ
// ══════════════════════════════════════════════════════════
window.showLicenseKey = async function(keyHash) {
  try {
    const res = await fetch("/admin/api/get-operator-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify({ keyHash }),
    });
    const data = await res.json();
    if (data.key) {
      // Показываем ключ в маленьком попапе
      const existing = document.getElementById("key-display-popup");
      if (existing) existing.remove();

      const popup = document.createElement("div");
      popup.id = "key-display-popup";
      popup.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
        padding:24px; z-index:99999; min-width:420px; box-shadow:0 16px 48px rgba(0,0,0,0.3);
        font-family:'Syne',sans-serif;
      `;
      popup.innerHTML = `
        <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:12px;">🔑 Лицензионный ключ</div>
        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:12px; font-family:monospace; font-size:13px; color:var(--primary); word-break:break-all; margin-bottom:14px;">${data.key}</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${data.key}').then(()=>showToast('Ключ скопирован!'))">📋 Копировать</button>
          <button class="btn" onclick="document.getElementById('key-display-popup').remove(); document.getElementById('key-popup-overlay').remove();">Закрыть</button>
        </div>
      `;
      const overlay = document.createElement("div");
      overlay.id = "key-popup-overlay";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998;";
      overlay.onclick = () => { popup.remove(); overlay.remove(); };
      document.body.appendChild(overlay);
      document.body.appendChild(popup);
    } else {
      showToast(data.error || "Ключ недоступен — он хранится только пока оператор онлайн", true);
    }
  } catch(e) {
    showToast("Ошибка получения ключа", true);
  }
};

// ══════════════════════════════════════════════════════════
// FIX 5: Загрузка логов оператора во вкладке Logs
// ══════════════════════════════════════════════════════════
async function loadOperatorLogs(keyHash) {
  const logContainer = document.getElementById('tab-logs');
  if (!logContainer) return;
  logContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-3);">⏳ Загрузка логов...</div>`;
  try {
    const res = await fetch(`/admin/api/operator-logs/${keyHash}`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!data.logs || data.logs.length === 0) {
      logContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-3);">Логов не найдено</div>`;
      return;
    }
    const lines = data.logs.map(line => {
      let color = 'var(--text-2)';
      if (line.includes('✅') || line.includes('УСПЕШНО')) color = 'var(--success, #22c55e)';
      else if (line.includes('❌') || line.includes('ОШИБКА')) color = 'var(--danger)';
      else if (line.includes('📡') || line.includes('ДИСКОННЕКТ')) color = '#f59e0b';
      else if (line.includes('🌐') || line.includes('ПОДКЛЮЧЕНИЕ')) color = 'var(--primary)';
      else if (line.includes('↳')) color = 'var(--text-3)';
      return `<div style="font-size:11px; font-family:monospace; line-height:1.6; color:${color}; padding:1px 0; border-bottom:1px solid rgba(255,255,255,0.03);">${escapeHtml(line)}</div>`;
    }).join('');
    logContainer.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:12px; color:var(--text-3);">Последние ${data.logs.length} строк</div>
          <button class="btn btn-icon" onclick="loadOperatorLogs('${keyHash}')">🔄 Обновить</button>
        </div>
        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:12px; max-height:480px; overflow-y:auto; overflow-x:auto;">
          ${lines}
        </div>
      </div>
    `;
    // Скролл вниз
    setTimeout(() => {
      const el = logContainer.querySelector('[style*="overflow-y:auto"]');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  } catch(e) {
    logContainer.innerHTML = `<div style="padding:20px; color:var(--danger);">Ошибка загрузки логов: ${e.message}</div>`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Перехватываем клик на вкладку Logs
document.addEventListener('click', function(e) {
  const tab = e.target.closest('.modal-tab');
  if (tab && tab.dataset.tab === 'logs') {
    const hash = document.getElementById('op-modal-overlay')?.dataset.currentHash;
    if (hash) loadOperatorLogs(hash);
  }
});

// ══════════════════════════════════════════════════════════
// FIX 6: Показ статистики успех/ошибки (только для CEO)
// ══════════════════════════════════════════════════════════
function renderSuccessErrorStats(op, container) {
  const stats = op.details?.stats;
  if (!stats) return;
  const chatS = stats.chatSuccess || 0;
  const chatE = stats.chatErrors || 0;
  const letS  = stats.letterSuccess || 0;
  const letE  = stats.letterErrors || 0;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex; gap:12px; margin-top:10px; flex-wrap:wrap;';
  row.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;flex:1;min-width:100px;">
      <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px;">💬 Чаты</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="color:#22c55e;font-weight:700;font-size:16px;">✅ ${chatS}</span>
        ${chatE > 0 ? `<span style="color:var(--danger);font-weight:700;font-size:14px;">❌ ${chatE}</span>` : ''}
      </div>
    </div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;flex:1;min-width:100px;">
      <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px;">✉️ Письма</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="color:#22c55e;font-weight:700;font-size:16px;">✅ ${letS}</span>
        ${letE > 0 ? `<span style="color:var(--danger);font-weight:700;font-size:14px;">❌ ${letE}</span>` : ''}
      </div>
    </div>
  `;
  container.appendChild(row);
}

// Патч showOpDetails — добавляем блок CEO-статистики
const _origShowOpDetails = window.showOpDetails;
window.showOpDetails = function(hash) {
  _origShowOpDetails(hash);
  // После открытия модала — добавляем блок если CEO
  setTimeout(() => {
    const isCeo = document.getElementById('superadmin-panel')?.style.display !== 'none';
    if (!isCeo) return;
    const rotTab = document.getElementById('tab-rotation');
    if (!rotTab) return;
    const op = window.currentOperatorsData.find(o => o.keyHash === hash);
    if (!op) return;
    const existing = rotTab.querySelector('#ceo-stats-block');
    if (existing) existing.remove();
    const block = document.createElement('div');
    block.id = 'ceo-stats-block';
    block.style.cssText = 'padding:0 20px 16px;';
    block.innerHTML = '<div style="font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:6px;">CEO: Детальная статистика</div>';
    renderSuccessErrorStats(op, block);
    rotTab.insertBefore(block, rotTab.firstChild);
  }, 50);
};

// ══════════════════════════════════════════════════════════
// FIX 7: ANNOUNCEMENTS — баннер для всех пользователей
// ══════════════════════════════════════════════════════════
async function checkAnnouncements() {
  try {
    const res = await fetch('/admin/api/announcements/active', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!data.announcement) return;
    showAnnouncementBanner(data.announcement);
  } catch(e) {}
}

function showAnnouncementBanner(ann) {
  const existing = document.getElementById('announcement-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'announcement-banner';
  banner.style.cssText = `
    position:fixed; top:0; left:0; right:0; z-index:99990;
    background:linear-gradient(90deg, var(--primary), #6366f1);
    color:#fff; padding:14px 24px;
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    box-shadow:0 4px 24px rgba(0,0,0,0.3); font-family:'Syne',sans-serif;
    animation: slideDown 0.4s ease-out;
  `;
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex:1;">
      <span style="font-size:20px;">📢</span>
      <div style="font-size:14px;font-weight:600;line-height:1.4;">${escapeHtml(ann.message)}</div>
    </div>
    <button onclick="dismissAnnouncement(${ann.id})" style="
      background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);
      color:#fff;padding:6px 16px;border-radius:8px;cursor:pointer;
      font-family:'Syne',sans-serif;font-weight:600;font-size:13px;flex-shrink:0;
    ">Понятно ✕</button>
  `;
  // Push dashboard content down
  document.body.prepend(banner);
  const dash = document.getElementById('dashboard-screen');
  if (dash) dash.style.paddingTop = '56px';
}

window.dismissAnnouncement = async function(id) {
  try {
    await fetch(`/admin/api/announcements/${id}/view`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
  } catch(e) {}
  const banner = document.getElementById('announcement-banner');
  if (banner) { banner.style.opacity='0'; banner.style.transform='translateY(-100%)'; banner.style.transition='all 0.3s'; setTimeout(()=>{ banner.remove(); const dash=document.getElementById('dashboard-screen'); if(dash) dash.style.paddingTop=''; },300); }
};

// ── CEO: Панель управления объявлениями ──
function renderAnnouncementManager() {
  const panel = document.getElementById('announcement-manager');
  if (!panel) return;

  panel.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <div class="card-head">
        <div class="card-head-title">
          <div class="card-head-icon" style="background:var(--primary-dim);">📢</div>
          Объявления для всех пользователей
        </div>
      </div>
      <div style="padding:16px;">
        <div class="form-group">
          <label class="form-label">Текст объявления</label>
          <textarea id="ann-text" class="form-input" rows="3" placeholder="Введите текст объявления..." style="resize:vertical;"></textarea>
        </div>
        <button class="btn btn-primary" onclick="createAnnouncement()">📢 Отправить всем</button>
        <div id="ann-list" style="margin-top:16px;"></div>
      </div>
    </div>
  `;
  loadAnnouncementsList();
}

async function loadAnnouncementsList() {
  try {
    const res = await fetch('/admin/api/announcements', { headers: { 'Authorization': `Bearer ${getToken()}` } });
    const data = await res.json();
    const container = document.getElementById('ann-list');
    if (!container) return;
    if (!data.announcements?.length) { container.innerHTML = '<div style="color:var(--text-3);font-size:13px;">Нет объявлений</div>'; return; }
    container.innerHTML = data.announcements.map(a => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">${escapeHtml(a.message)}</div>
          <div style="font-size:11px;color:var(--text-3);">${new Date(a.created_at).toLocaleString('ru-RU')} · ${a.is_active ? '<span style="color:#22c55e;">Активно</span>' : '<span style="color:var(--text-3);">Деактивировано</span>'}</div>
        </div>
        ${a.is_active ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="deactivateAnnouncement(${a.id})">Деактивировать</button>` : ''}
      </div>
    `).join('');
  } catch(e) {}
}

window.createAnnouncement = async function() {
  const text = document.getElementById('ann-text')?.value?.trim();
  if (!text) { showToast('Введите текст объявления', true); return; }
  try {
    const res = await fetch('/admin/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Объявление отправлено!');
      document.getElementById('ann-text').value = '';
      loadAnnouncementsList();
    } else {
      showToast(data.error || 'Ошибка', true);
    }
  } catch(e) { showToast('Ошибка', true); }
};

window.deactivateAnnouncement = async function(id) {
  try {
    await fetch(`/admin/api/announcements/${id}/deactivate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    loadAnnouncementsList();
  } catch(e) {}
};

// Инициализация объявлений при загрузке
const _origCheckAuth = checkAuthState;
// Check announcements after login
const _origFetchDash = fetchDashboard;
window.fetchDashboard = async function() {
  await _origFetchDash.apply(this, arguments);
  checkAnnouncements();
  // Render announcement manager for CEO
  if (document.getElementById('announcement-manager')) {
    renderAnnouncementManager();
  }
};

// ══════════════════════════════════════════════════════════════
// MANS TAB — Управление мужчинами (Read-Through Cache)
// ══════════════════════════════════════════════════════════════

let mansCurrentPage = 1;

function formatTimeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

async function fetchMansList(page) {
  if (page) mansCurrentPage = page;
  const token = getToken();
  if (!token) return;

  const search = document.getElementById('mans-search')?.value || '';
  const minSpend = document.getElementById('mans-min-spend')?.value || '';
  const maxSpend = document.getElementById('mans-max-spend')?.value || '';
  const fromDate = document.getElementById('mans-from-date')?.value || '';
  const toDate = document.getElementById('mans-to-date')?.value || '';

  const params = new URLSearchParams();
  params.set('page', mansCurrentPage);
  params.set('limit', '50');
  if (search) params.set('search', search);
  if (minSpend) params.set('min_spend', minSpend);
  if (maxSpend) params.set('max_spend', maxSpend);
  if (fromDate) params.set('from_date', fromDate);
  if (toDate) params.set('to_date', toDate);

  try {
    const res = await fetch(`/api/mans?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      showToast('Ошибка загрузки мужчин', true);
      return;
    }
    const data = await res.json();
    renderMansTable(data);
  } catch (e) {
    console.error('fetchMansList error:', e);
    showToast('Ошибка сети', true);
  }
}

function renderMansTable(data) {
  const tbody = document.getElementById('mans-table');
  const pagination = document.getElementById('mans-pagination');
  const totalCount = document.getElementById('mans-total-count');

  if (!tbody) return;

  totalCount.textContent = `(${data.total || 0} записей)`;

  if (!data.mans || data.mans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3);">
      📋 Нет данных. Используйте "Быстрый запрос" для загрузки данных мужчины.
    </td></tr>`;
    pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = data.mans.map(m => `
    <tr>
      <td style="font-family:var(--mono);font-size:13px;font-weight:600;">${escapeHtml(m.man_id)}</td>
      <td><span style="color:var(--green);font-weight:700;">$${Number(m.spend || 0).toFixed(2)}</span></td>
      <td>${m.reg_date || '—'}</td>
      <td style="font-size:12px;color:var(--text-2);">${formatTimeAgo(m.last_updated)}</td>
      <td>
        <button class="btn btn-sm" onclick="refreshManData('${escapeHtml(m.man_id)}')" style="font-size:11px;padding:4px 10px;">
          🔄 Обновить
        </button>
      </td>
    </tr>
  `).join('');

  // Pagination
  if (data.pages > 1) {
    let paginationHtml = '';
    if (mansCurrentPage > 1) {
      paginationHtml += `<button class="btn btn-sm btn-secondary" onclick="fetchMansList(${mansCurrentPage - 1})">← Назад</button>`;
    }
    paginationHtml += `<span style="font-size:13px;color:var(--text-2);">Стр. ${data.page} из ${data.pages}</span>`;
    if (mansCurrentPage < data.pages) {
      paginationHtml += `<button class="btn btn-sm btn-secondary" onclick="fetchMansList(${mansCurrentPage + 1})">Вперёд →</button>`;
    }
    pagination.innerHTML = paginationHtml;
  } else {
    pagination.innerHTML = '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Быстрый запрос баланса одного мужчины
async function quickManLookup() {
  const manId = document.getElementById('mans-quick-id')?.value?.trim();
  if (!manId) {
    showToast('Введите Man ID', true);
    return;
  }

  const resultDiv = document.getElementById('mans-quick-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="color:var(--text-2);font-size:13px;">⏳ Загрузка...</div>';

  try {
    const token = getToken();
    const res = await fetch(`/api/mans/${encodeURIComponent(manId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      resultDiv.innerHTML = '<div style="color:var(--red);">❌ Ошибка запроса</div>';
      return;
    }

    const data = await res.json();
    const sourceLabel = {
      'cache': '📦 Кэш (свежий)',
      'fresh': '🌐 Внешний API (обновлено)',
      'stale': '⚠️ Кэш (устаревший)',
      'empty': '❓ Нет данных'
    }[data.source] || data.source;

    resultDiv.innerHTML = `
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;padding:12px;background:var(--surface2);border-radius:var(--r);margin-top:8px;">
        <div>
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;">Man ID</div>
          <div style="font-family:var(--mono);font-size:15px;font-weight:700;">${escapeHtml(data.man_id)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;">Balance</div>
          <div style="font-size:22px;font-weight:800;color:var(--green);">$${Number(data.spend || 0).toFixed(2)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;">Дата рождения</div>
          <div style="font-size:15px;font-weight:600;">${data.reg_date || '—'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;">Источник</div>
          <div style="font-size:13px;">${sourceLabel}</div>
        </div>
      </div>
    `;
  } catch (e) {
    resultDiv.innerHTML = '<div style="color:var(--red);">❌ Ошибка сети</div>';
  }
}

// Обновить данные конкретного мужчины (force refresh)
window.refreshManData = async function(manId) {
  try {
    const token = getToken();
    const res = await fetch(`/api/mans/${encodeURIComponent(manId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showToast(`✅ Данные ${manId} обновлены`);
      fetchMansList();
    } else {
      showToast('Ошибка обновления', true);
    }
  } catch (e) {
    showToast('Ошибка сети', true);
  }
};

// Привязка кнопок
document.getElementById('btn-mans-search')?.addEventListener('click', () => {
  mansCurrentPage = 1;
  fetchMansList();
});

document.getElementById('btn-mans-reset')?.addEventListener('click', () => {
  document.getElementById('mans-search').value = '';
  document.getElementById('mans-min-spend').value = '';
  document.getElementById('mans-max-spend').value = '';
  document.getElementById('mans-from-date').value = '';
  document.getElementById('mans-to-date').value = '';
  mansCurrentPage = 1;
  fetchMansList();
});

document.getElementById('btn-mans-quick')?.addEventListener('click', quickManLookup);

document.getElementById('mans-quick-id')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') quickManLookup();
});

document.getElementById('mans-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { mansCurrentPage = 1; fetchMansList(); }
});
