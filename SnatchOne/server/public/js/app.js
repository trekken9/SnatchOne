const getToken = () => localStorage.getItem("snatch_token");
const setToken = (token) => localStorage.setItem("snatch_token", token);
const removeToken = () => localStorage.removeItem("snatch_token");

window.currentOperatorsData = [];
let profileLoaded = false;

// --- НАВИГАЦИЯ ---
document
  .getElementById("nav-dash")
  .addEventListener("click", () => switchView("dashboard"));
document
  .getElementById("nav-users")
  .addEventListener("click", () => switchView("users"));

function switchView(view) {
  document.getElementById("view-dashboard").style.display =
    view === "dashboard" ? "block" : "none";
  document.getElementById("view-users").style.display =
    view === "users" ? "block" : "none";
  document
    .getElementById("nav-dash")
    .classList.toggle("active", view === "dashboard");
  document
    .getElementById("nav-users")
    .classList.toggle("active", view === "users");

  if (view === "users") fetchUsersList();
}

function checkAuthState() {
  const token = getToken();
  if (token) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("dashboard-screen").style.display = "block";
    fetchDashboard();
    if (!window.dashboardInterval)
      window.dashboardInterval = setInterval(fetchDashboard, 5000);
  } else {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("dashboard-screen").style.display = "none";
    if (window.dashboardInterval) clearInterval(window.dashboardInterval);
  }
}

setInterval(() => {
  document.getElementById("time").innerText = new Date().toLocaleTimeString();
}, 1000);

document.getElementById("btn-login").addEventListener("click", async () => {
  const user = document.getElementById("login-user").value;
  const pass = document.getElementById("login-pass").value;
  const errDiv = document.getElementById("login-error");

  try {
    const res = await fetch("/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (data.success) {
      setToken(data.token);
      errDiv.innerText = "";
      profileLoaded = false;
      switchView("dashboard"); // Сбрасываем вид на главную
      checkAuthState();
    } else {
      errDiv.innerText = data.error || "Ошибка входа";
    }
  } catch (e) {
    errDiv.innerText = "Ошибка соединения с сервером";
  }
});

document.getElementById("btn-logout").addEventListener("click", () => {
  removeToken();
  checkAuthState();
});

// Аватарка превью
document.getElementById("btn-upload-avatar").addEventListener("click", () => {
  document.getElementById("prof-avatar-file").click();
});

document
  .getElementById("prof-avatar-file")
  .addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024)
      return alert("Файл слишком большой! Выберите картинку до 3 МБ.");

    const reader = new FileReader();
    reader.onload = function (event) {
      const base64String = event.target.result;
      document.getElementById("prof-avatar-base64").value = base64String;
      document.getElementById("prof-avatar-preview").src = base64String;
      document.getElementById("btn-upload-avatar").textContent =
        "✅ " + file.name;
      document.getElementById("btn-upload-avatar").style.color = "#00b894";
      document.getElementById("btn-upload-avatar").style.borderColor =
        "#00b894";
    };
    reader.readAsDataURL(file);
  });

document
  .getElementById("btn-save-profile")
  .addEventListener("click", async () => {
    const nickname = document.getElementById("prof-nickname").value;
    const avatar = document.getElementById("prof-avatar-base64").value;
    const telegram = document.getElementById("prof-telegram").value;
    const password = document.getElementById("prof-new-pass").value; // Берем пароль

    document.getElementById("btn-save-profile").innerText = "Сохранение...";
    try {
      await fetch("/admin/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ nickname, avatar, telegram, password }), // Отправляем пароль
      });
      profileLoaded = false;
      document.getElementById("prof-new-pass").value = ""; // Очищаем поле после смены
      fetchDashboard();
      alert("✅ Профиль успешно сохранен!");
    } catch (e) {
      alert("Ошибка сети!");
    }
    document.getElementById("btn-save-profile").innerText = "Сохранить профиль";
  });

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

    if (data.profile) {
      const avatarUrl =
        data.profile.avatar || "https://via.placeholder.com/100";
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
            "✅ Фото загружено";
          document.getElementById("btn-upload-avatar").style.color = "#00b894";
        }
        profileLoaded = true;
      }
    }

    document.getElementById("stat-online").innerText = data.activeSessions || 0;
    document.getElementById("stat-chats").innerText = data.globalChats || 0;
    document.getElementById("stat-letters").innerText = data.globalLetters || 0;

    const roleNames = {
      superadmin: "Босс",
      admin: "Админ",
      team: "Команда",
      translator: "Переводчик",
    };
    document.getElementById("user-role-badge").innerText =
      `[${roleNames[data.role] || data.role}]`;

    // Показываем меню навигации только админам
    if (data.role === "admin" || data.role === "superadmin") {
      document.getElementById("admin-nav").style.display = "flex";
    } else {
      document.getElementById("admin-nav").style.display = "none";
    }

    // Панель генерации ключей видят ТОЛЬКО Админ и Супер-Админ. Команда и Переводчик — нет.
    if (data.role === "admin" || data.role === "superadmin") {
      document.getElementById("key-gen-panel").style.display = "block";
    } else {
      document.getElementById("key-gen-panel").style.display = "none";
    }

    if (data.role === "superadmin") {
      document.getElementById("superadmin-panel").style.display = "block";
      document.getElementById("team-select-group").style.display = "block";
      const teamSelect = document.getElementById("key-team-owner");
      if (data.users && teamSelect.options.length <= 1) {
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

    const tbody = document.getElementById("users-table");
    tbody.innerHTML = "";
    if (!data.operators || data.operators.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">У вас нет активных ключей</td></tr>';
      return;
    }

    data.operators.forEach((op) => {
      const days = Math.floor(op.expSec / 86400);
      const hours = Math.floor((op.expSec % 86400) / 3600);
      const detailsBtn = op.isOnline
        ? `<button class="btn-info" onclick="showOpDetails('${op.keyHash}')" style="background: rgba(108, 92, 231, 0.15); color: #a29bfe; border: 1px solid rgba(108, 92, 231, 0.4); padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 5px; width: max-content; height: fit-content;" onmouseover="this.style.background='rgba(108, 92, 231, 0.3)'" onmouseout="this.style.background='rgba(108, 92, 231, 0.15)'">📊 Инфо</button>`
        : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><span class="status ${op.isOnline ? "online" : "offline"}"></span></td>
                <td><strong>${op.operatorId || "Без имени"}</strong></td>
                <td><span class="badge">${op.keyHash.substring(0, 8)}...</span></td>
                <td style="color: ${days < 2 ? "var(--danger)" : "#fff"}">${days}д ${hours}ч</td>
                <td>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${detailsBtn}
                        ${data.role !== "translator" ? `<button class="btn-kill" onclick="kickUser('${op.keyHash}')" style="width: max-content; padding: 6px 12px; font-size: 12px; border-radius: 6px; height: fit-content; margin: 0;">Удалить</button>` : ""}
                    </div>
                </td>
            `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Ошибка обновления:", e);
  }
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ ВЫВОДА БАЗЫ ПОЛЬЗОВАТЕЛЕЙ ---
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

    const roleColors = {
      superadmin:
        '<span style="color:#d63031; font-weight:bold; background:#fff0f0; padding:2px 6px; border-radius:4px;">👑 Босс</span>',
      admin:
        '<span style="color:#e17055; font-weight:bold; background:#ffeaa7; padding:2px 6px; border-radius:4px;">🛡 Админ</span>',
      team: '<span style="color:#0984e3; font-weight:bold; background:#74b9ff30; padding:2px 6px; border-radius:4px;">🏢 Команда</span>',
      translator:
        '<span style="color:#00b894; font-weight:bold; background:#e6fffa; padding:2px 6px; border-radius:4px;">💻 Переводчик</span>',
    };

    data.users.forEach((u) => {
      const avatar = u.avatar || "https://via.placeholder.com/100";
      const tg = u.telegram
        ? `<a href="https://t.me/${u.telegram}" target="_blank" class="tg-link">@${u.telegram}</a>`
        : '<span style="color:#b2bec3; font-size:12px;">Не указан</span>';

      // Вычисляем связи через лицензии
      let relationsHtml = '<span style="color:#b2bec3">-</span>';

      if (u.role === "translator") {
        const myLic = data.licenses.find((l) => l.translator_id === u.id);
        if (myLic) {
          const myTeam = data.users.find((tu) => tu.id === myLic.creator_id);
          const teamName = myTeam
            ? myTeam.nickname || myTeam.username
            : "Неизвестно";
          relationsHtml = `
                        <div style="font-size:12px; margin-bottom:4px;">Ключ: <span style="font-family:monospace; color:#a29bfe;">${myLic.key_hash.substring(0, 8)}...</span></div>
                        <div style="font-size:11px; color:#636e72;">Привязан к: <b style="color:#0984e3;">${teamName}</b></div>
                    `;
        }
      } else if (u.role === "team" || u.role === "superadmin") {
        const createdKeys = data.licenses.filter(
          (l) => l.creator_id === u.id,
        ).length;
        relationsHtml = `<div style="font-size:12px; color:#00b894; font-weight:600;">Выдано ключей: ${createdKeys} шт.</div>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>
                    <div class="user-profile-cell">
                        <img src="${avatar}" class="user-avatar-mini">
                        <div>
                            <div style="font-weight:700; font-size:13px; color:#f1f2f6;">${u.nickname || "Без имени"}</div>
                            <div style="font-size:11px; color:#636e72;">Логин: ${u.username}</div>
                        </div>
                    </div>
                </td>
                <td>${tg}</td>
                <td>${roleColors[u.role] || u.role}</td>
                <td>${relationsHtml}</td>
                <td>
                    ${
                      data.role === "superadmin"
                        ? `
                    <div style="display:flex; gap:5px; align-items:center;">
                        <button onclick="changeUserPass(${u.id}, '${u.username}')" style="background:#6c5ce7; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px; transition: .2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🔑 Пароль</button>
                        ${u.role !== "superadmin" ? `<button class="btn-kill" onclick="deleteUserProfile(${u.id}, '${u.username}')" style="padding: 4px 8px; font-size: 11px; margin:0;">Удалить</button>` : ""}
                    </div>
                    `
                        : '<span style="color:#b2bec3; font-size:11px;">-</span>'
                    }
                </td>
            `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Ошибка загрузки пользователей:", e);
  }
}

window.showOpDetails = function (hash) {
  const op = window.currentOperatorsData.find((o) => o.keyHash === hash);
  if (!op || !op.details) return;

  const { config, stats } = op.details;
  const profiles = new Set();
  if (config.letters)
    Object.keys(config.letters).forEach(
      (k) => k !== "global" && profiles.add(k),
    );
  Object.keys(config).forEach((k) => {
    if (k.startsWith("invites") && k !== "invites")
      profiles.add(k.replace("invites", ""));
  });

  let html = `<div style="display:flex; gap:15px; margin-bottom:25px;">
        <div class="stat-card" style="flex:1; padding:20px; background:#1e1e24; border: 1px solid #3f3f4e; border-radius: 12px; text-align: center;">
            <div style="font-size: 12px; color: #b2bec3; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">Отправлено чатов</div>
            <div style="font-size: 28px; font-weight: 700; color: #0984e3;">${stats.chat}</div>
        </div>
        <div class="stat-card" style="flex:1; padding:20px; background:#1e1e24; border: 1px solid #3f3f4e; border-radius: 12px; text-align: center;">
            <div style="font-size: 12px; color: #b2bec3; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">Отправлено писем</div>
            <div style="font-size: 28px; font-weight: 700; color: #6c5ce7;">${stats.letters}</div>
        </div>
    </div>`;

  html += `<h3 style="margin-bottom:15px; color: #f1f2f6; font-size: 16px; border-bottom: 1px solid #3f3f4e; padding-bottom: 10px;">Активные анкеты оператора:</h3>`;
  if (
    profiles.size === 0 &&
    (!config.invites || Object.keys(config.invites).length === 0)
  ) {
    html += `<p style="color:#636e72; font-style: italic; text-align: center; margin-top: 30px;">Этот оператор еще не настроил ни одной анкеты.</p>`;
  }

  if (
    (config.invites && Object.keys(config.invites).length > 0) ||
    (config.letters && config.letters["global"])
  )
    profiles.add("global");

  profiles.forEach((pid) => {
    let invCount = 0;
    let letCount = 0;
    let invHtml = "";
    let letHtml = "";
    const invKey = pid === "global" ? "invites" : "invites" + pid;
    if (config[invKey]) {
      Object.keys(config[invKey]).forEach((cat) => {
        const items = config[invKey][cat];
        if (items && items.length) {
          invCount += items.length;
          items.forEach((it) => {
            const text =
              typeof it === "string" ? it : it.text || "[Только фото/видео]";
            invHtml += `<div style="background:#1e1e24; color: #dcdde1; padding:12px; border-radius:8px; margin-bottom:8px; font-size:13px; border: 1px solid #333344; line-height: 1.5;"><b style="color: #00b894; margin-bottom: 4px; display: block;">[${cat}]</b>${text}</div>`;
          });
        }
      });
    }
    if (config.letters && config.letters[pid]) {
      const items = config.letters[pid];
      letCount = items.length;
      items.forEach((it) => {
        const text =
          typeof it === "string" ? it : it.text || "[Только фото/видео]";
        letHtml += `<div style="background:#1e1e24; color: #dcdde1; padding:12px; border-radius:8px; margin-bottom:8px; font-size:13px; border: 1px solid #333344; line-height: 1.5;">${text}</div>`;
      });
    }

    if (invCount > 0 || letCount > 0) {
      const title =
        pid === "global" ? "🌐 Глобальные настройки" : `👤 Анкета ID: ${pid}`;
      html += `<div style="border:1px solid #3f3f4e; background: #2a2a32; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px dashed #3f3f4e; padding-bottom: 10px;">
                    <h4 style="margin:0; color:#a29bfe; font-size: 15px;">${title}</h4>
                    <div style="font-size:12px; color:#b2bec3; background: #1e1e24; padding: 4px 12px; border-radius: 20px; border: 1px solid #333344;">
                        Инвайтов: <b style="color:#00b894;">${invCount}</b> <span style="margin: 0 5px; color: #444;">|</span> Писем: <b style="color:#6c5ce7;">${letCount}</b>
                    </div>
                </div>
                <div style="display:flex; gap:20px;">
                    <div style="flex:1; max-height:280px; overflow-y:auto; padding-right:10px;"><div style="font-size: 11px; color: #636e72; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; letter-spacing: 1px;">Инвайты</div>${invHtml || '<div style="color:#636e72; font-style: italic; font-size: 13px;">Не настроено</div>'}</div>
                    <div style="flex:1; max-height:280px; overflow-y:auto; padding-right:10px;"><div style="font-size: 11px; color: #636e72; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; letter-spacing: 1px;">Письма</div>${letHtml || '<div style="color:#636e72; font-style: italic; font-size: 13px;">Не настроено</div>'}</div>
                </div>
            </div>`;
    }
  });

  document.getElementById("op-modal-title").innerText =
    `Оператор: ${op.operatorId}`;
  document.getElementById("op-modal-content").innerHTML = html;
  document.getElementById("op-modal-overlay").style.display = "flex";
};

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
      document.getElementById("new-key-result").style.display = "block";
      let tableHtml = `<div style="width: 100%; overflow-x: auto; border-radius: 8px; background: #2d2d3a;">
                <table style="width: 100%; text-align: left; border-collapse: collapse; white-space: nowrap; font-size: 12px;">
                    <tr style="background: #3f3f4e; color: #fff;">
                        <th style="padding: 10px 8px;">Ключ для бота</th>
                        <th style="padding: 10px 8px;">Логин</th>
                        <th style="padding: 10px 8px;">Пароль</th>
                    </tr>`;

      data.keys.forEach((k) => {
        tableHtml += `<tr>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #3f3f4e; font-family: monospace; color: #a29bfe; font-weight: bold;">${k.key}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #3f3f4e; color: #f1f2f6;">${k.login}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #3f3f4e; color: #ff7675; font-family: monospace;">${k.password}</td>
                </tr>`;
      });
      tableHtml += `</table></div>`;
      document.getElementById("new-key-value").innerHTML = tableHtml;
      fetchDashboard();
    } else {
      alert(data.error || "Ошибка генерации");
    }
  } catch (e) {
    alert("Ошибка сети!");
  } finally {
    btn.disabled = false;
    btn.innerText = "Сгенерировать";
  }
});

document
  .getElementById("btn-create-user")
  ?.addEventListener("click", async () => {
    const username = document.getElementById("new-user-name").value;
    const password = document.getElementById("new-user-pass").value;
    const role = document.getElementById("new-user-role").value;

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
        alert(`Пользователь ${username} успешно создан!`);
        document.getElementById("new-user-name").value = "";
        document.getElementById("new-user-pass").value = "";
        fetchDashboard();
        fetchUsersList(); // Обновляем базу юзеров
      } else {
        alert(data.error || "Ошибка создания");
      }
    } catch (e) {
      alert("Ошибка сети!");
    }
  });

window.kickUser = async function (hash) {
  if (!confirm("Удалить этот ключ?")) return;
  try {
    await fetch("/admin/api/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ hash }),
    });
    fetchDashboard();
  } catch (e) {
    alert("Ошибка при удалении!");
  }
};

// Функция принудительной смены пароля Супер-Админом
window.changeUserPass = async function (userId, username) {
  const newPass = prompt(`Введите новый пароль для пользователя ${username}:`);
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
      alert(`✅ Пароль для ${username} успешно изменен!`);
    } else {
      alert("Ошибка: " + (data.error || "Неизвестная ошибка"));
    }
  } catch (e) {
    alert("Ошибка сети!");
  }
};

// Функция полного удаления профиля пользователя
window.deleteUserProfile = async function (userId, username) {
  if (
    !confirm(
      `⚠️ ВНИМАНИЕ! Вы уверены, что хотите НАВСЕГДА удалить пользователя "${username}"? \n\nВсе его ключи будут удалены, а боты - остановлены.`,
    )
  ) {
    return;
  }

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
      alert(`✅ Пользователь ${username} успешно удален!`);
      fetchUsersList(); // Обновляем таблицу Базы пользователей
      fetchDashboard(); // Обновляем Дашборд
    } else {
      alert("Ошибка: " + (data.error || "Неизвестная ошибка"));
    }
  } catch (e) {
    alert("Ошибка сети!");
  }
};

checkAuthState();
