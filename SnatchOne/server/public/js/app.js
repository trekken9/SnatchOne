// ─── TOKEN ───────────────────────────────────────────
const getToken    = () => localStorage.getItem("snatch_token");
const setToken    = (t) => localStorage.setItem("snatch_token", t);
const removeToken = ()  => localStorage.removeItem("snatch_token");

window.currentOperatorsData = [];
let profileLoaded = false;
let generatedKeysData = null; // хранит последние сгенерированные ключи для скачивания

// ─── CLOCK ───────────────────────────────────────────
setInterval(() => {
    const el = document.getElementById("time");
    if (el) el.innerText = new Date().toLocaleTimeString("ru-RU");
}, 1000);

// ─── NAVIGATION ──────────────────────────────────────
document.getElementById("nav-dash").addEventListener("click",  () => switchView("dashboard"));
document.getElementById("nav-users").addEventListener("click", () => switchView("users"));

function switchView(view) {
    document.getElementById("view-dashboard").style.display = view === "dashboard" ? "block" : "none";
    document.getElementById("view-users").style.display     = view === "users"     ? "block" : "none";
    document.getElementById("nav-dash").classList.toggle("active",  view === "dashboard");
    document.getElementById("nav-users").classList.toggle("active", view === "users");
    if (view === "users") fetchUsersList();
}

// ─── AUTH ─────────────────────────────────────────────
function checkAuthState() {
    const token = getToken();
    if (token) {
        document.getElementById("login-screen").style.display    = "none";
        document.getElementById("dashboard-screen").style.display = "block";
        fetchDashboard();
        if (!window.dashboardInterval)
            window.dashboardInterval = setInterval(fetchDashboard, 5000);
    } else {
        document.getElementById("login-screen").style.display    = "flex";
        document.getElementById("dashboard-screen").style.display = "none";
        if (window.dashboardInterval) {
            clearInterval(window.dashboardInterval);
            window.dashboardInterval = null;
        }
    }
}

// Нажатие Enter в поле логина/пароля
["login-user", "login-pass"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("btn-login").click();
    });
});

document.getElementById("btn-login").addEventListener("click", async () => {
    const btn  = document.getElementById("btn-login");
    const user = document.getElementById("login-user").value.trim();
    const pass = document.getElementById("login-pass").value;
    const err  = document.getElementById("login-error");

    if (!user || !pass) {
        showError(err, "Заполните все поля");
        return;
    }

    btn.innerText = "Вход...";
    btn.disabled  = true;

    try {
        const res  = await fetch("/admin/api/login", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ username: user, password: pass })
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
        btn.innerText = "🔐 Войти в систему";
        btn.disabled  = false;
    }
});

document.getElementById("btn-logout").addEventListener("click", () => {
    removeToken();
    profileLoaded = false;
    checkAuthState();
});

function showError(el, msg) {
    el.innerText      = msg;
    el.style.display  = "block";
}

// ─── AVATAR UPLOAD ────────────────────────────────────
document.getElementById("btn-upload-avatar").addEventListener("click", () => {
    document.getElementById("prof-avatar-file").click();
});

document.getElementById("prof-avatar-file").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        alert("Файл слишком большой! Выберите до 3 МБ.");
        return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
        const b64 = ev.target.result;
        document.getElementById("prof-avatar-base64").value     = b64;
        document.getElementById("prof-avatar-preview").src      = b64;
        document.getElementById("btn-upload-avatar").textContent = "✅ " + file.name;
        document.getElementById("btn-upload-avatar").style.color = "var(--primary)";
        document.getElementById("btn-upload-avatar").style.borderColor = "var(--primary)";
    };
    reader.readAsDataURL(file);
});

// ─── SAVE PROFILE ─────────────────────────────────────
document.getElementById("btn-save-profile").addEventListener("click", async () => {
    const btn      = document.getElementById("btn-save-profile");
    const nickname = document.getElementById("prof-nickname").value;
    const avatar   = document.getElementById("prof-avatar-base64").value;
    const telegram = document.getElementById("prof-telegram").value;
    const password = document.getElementById("prof-new-pass").value;

    btn.innerText = "Сохранение...";
    btn.disabled  = true;

    try {
        await fetch("/admin/api/profile", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${getToken()}`
            },
            body: JSON.stringify({ nickname, avatar, telegram, password })
        });
        profileLoaded = false;
        document.getElementById("prof-new-pass").value = "";
        fetchDashboard();
        showToast("✅ Профиль сохранён!");
    } catch {
        showToast("❌ Ошибка сети!", true);
    } finally {
        btn.innerText = "💾 Сохранить профиль";
        btn.disabled  = false;
    }
});

// ─── DASHBOARD ────────────────────────────────────────
async function fetchDashboard() {
    try {
        const res = await fetch("/admin/api/status", {
            headers: { Authorization: `Bearer ${getToken()}` }
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
            const avatarUrl = data.profile.avatar || "https://via.placeholder.com/100";
            const nick      = data.profile.nickname || "Без имени";
            document.getElementById("hdr-avatar").src         = avatarUrl;
            document.getElementById("hdr-nickname").innerText = nick;

            if (!profileLoaded) {
                document.getElementById("prof-avatar-base64").value = data.profile.avatar || "";
                document.getElementById("prof-nickname").value      = data.profile.nickname || "";
                document.getElementById("prof-telegram").value      = data.profile.telegram || "";
                document.getElementById("prof-avatar-preview").src  = avatarUrl;
                if (data.profile.avatar) {
                    document.getElementById("btn-upload-avatar").textContent = "✅ Фото загружено";
                    document.getElementById("btn-upload-avatar").style.color = "var(--primary)";
                }
                profileLoaded = true;
            }
        }

        // Stats
        document.getElementById("stat-online").innerText  = data.activeSessions || 0;
        document.getElementById("stat-chats").innerText   = data.globalChats    || 0;
        document.getElementById("stat-letters").innerText = data.globalLetters  || 0;

        // Role badge
        const roleNames = { superadmin: "👑 Босс", admin: "🛡 Админ", team: "🏢 Команда", translator: "💻 Переводчик" };
        const badge = document.getElementById("user-role-badge");
        badge.innerText      = roleNames[data.role] || data.role;
        badge.style.display  = "inline-flex";

        // Admin nav
        const adminNav = document.getElementById("admin-nav");
        adminNav.style.display = (data.role === "admin" || data.role === "superadmin") ? "flex" : "none";

        // Key gen panel
        const keyPanel = document.getElementById("key-gen-panel");
        keyPanel.style.display = (data.role === "admin" || data.role === "superadmin") ? "block" : "none";

        // Superadmin extras
        if (data.role === "superadmin") {
            document.getElementById("superadmin-panel").style.display   = "block";
            document.getElementById("team-select-group").style.display  = "block";
            const teamSelect = document.getElementById("key-team-owner");
            if (data.users && teamSelect.options.length <= 1) {
                data.users.filter(u => u.role === "team").forEach(team => {
                    const opt   = document.createElement("option");
                    opt.value   = team.id;
                    opt.text    = `Команда: ${team.nickname || team.username}`;
                    teamSelect.add(opt);
                });
            }
        }

        // Keys table
        const tbody = document.getElementById("users-table");
        tbody.innerHTML = "";

        if (!data.operators || data.operators.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-3); padding:32px;">У вас нет активных ключей</td></tr>`;
            return;
        }

        data.operators.forEach(op => {
            const days  = Math.floor(op.expSec / 86400);
            const hours = Math.floor((op.expSec % 86400) / 3600);
            const timeClass = days < 1 ? "time-crit" : days < 3 ? "time-warn" : "time-ok";

            const infoBtn = op.isOnline
                ? `<button class="btn btn-icon" onclick="showOpDetails('${op.keyHash}')">📊 Инфо</button>`
                : "";

            const killBtn = data.role !== "translator"
                ? `<button class="btn btn-danger" onclick="kickUser('${op.keyHash}')">Удалить</button>`
                : "";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><span class="dot ${op.isOnline ? "online" : "offline"}"></span></td>
                <td><strong>${op.operatorId || "Без имени"}</strong></td>
                <td><span class="badge-mono">${op.keyHash.substring(0, 8)}…</span></td>
                <td><span class="${timeClass}">${days}д ${hours}ч</span></td>
                <td>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        ${infoBtn}
                        ${killBtn}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Ошибка обновления:", e);
    }
}

// ─── USERS LIST ───────────────────────────────────────
async function fetchUsersList() {
    try {
        const res = await fetch("/admin/api/all_users", {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.status !== 200) return;
        const data = await res.json();

        const tbody = document.getElementById("all-users-table");
        tbody.innerHTML = "";
        if (!data.users || data.users.length === 0) return;

        const roleBadge = {
            superadmin: '<span class="rb rb-boss">👑 Босс</span>',
            admin:      '<span class="rb rb-admin">🛡 Админ</span>',
            team:       '<span class="rb rb-team">🏢 Команда</span>',
            translator: '<span class="rb rb-transl">💻 Переводчик</span>'
        };

        data.users.forEach(u => {
            const avatar = u.avatar || "https://via.placeholder.com/100";
            const tg     = u.telegram
                ? `<a href="https://t.me/${u.telegram}" target="_blank" class="tg-link">@${u.telegram}</a>`
                : `<span style="color:var(--text-3);font-size:12px;">Не указан</span>`;

            let relHtml = '<span style="color:var(--text-3)">—</span>';
            if (u.role === "translator") {
                const lic    = data.licenses.find(l => l.translator_id === u.id);
                if (lic) {
                    const team   = data.users.find(tu => tu.id === lic.creator_id);
                    const tName  = team ? (team.nickname || team.username) : "Неизвестно";
                    relHtml      = `
                        <div style="font-size:12px; margin-bottom:3px;">Ключ: <span style="font-family:monospace; color:var(--secondary);">${lic.key_hash.substring(0,8)}…</span></div>
                        <div style="font-size:11px; color:var(--text-3);">К команде: <b style="color:var(--info);">${tName}</b></div>
                    `;
                }
            } else if (u.role === "team" || u.role === "superadmin") {
                const cnt = data.licenses.filter(l => l.creator_id === u.id).length;
                relHtml   = `<span style="color:var(--primary); font-weight:700; font-size:12px;">Выдано ключей: ${cnt}</span>`;
            }

            const actions = data.role === "superadmin"
                ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">
                       <button class="btn btn-icon" onclick="changeUserPass(${u.id},'${u.username}')">🔑 Пароль</button>
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
    btn.disabled  = true;
    btn.innerText = "Генерация...";

    const count   = document.getElementById("key-count").value;
    const days    = document.getElementById("key-duration").value;
    const note    = document.getElementById("key-note").value;
    const ownerId = document.getElementById("key-team-owner")?.value;

    try {
        const res  = await fetch("/admin/api/generate", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${getToken()}`
            },
            body: JSON.stringify({ count, days, note, ownerId })
        });
        const data = await res.json();

        if (data.success) {
            generatedKeysData = data.keys;

            // Show download box
            const resultBox  = document.getElementById("new-key-result");
            const countLabel = document.getElementById("key-result-count");
            countLabel.innerText        = `${data.keys.length} шт.`;
            resultBox.style.display     = "block";

            fetchDashboard();
            showToast(`✅ Сгенерировано ${data.keys.length} ключ(ей)!`);
        } else {
            showToast(data.error || "Ошибка генерации", true);
        }
    } catch {
        showToast("Ошибка сети!", true);
    } finally {
        btn.disabled  = false;
        btn.innerText = "🎯 Сгенерировать ключи";
    }
});

// ─── DOWNLOAD KEYS FILE ───────────────────────────────
document.getElementById("btn-download-keys").addEventListener("click", () => {
    if (!generatedKeysData || generatedKeysData.length === 0) return;

    const note     = document.getElementById("key-note").value || "без_имени";
    const duration = document.getElementById("key-duration").options[document.getElementById("key-duration").selectedIndex].text;
    const now      = new Date();
    const dateStr  = now.toLocaleDateString("ru-RU");
    const timeStr  = now.toLocaleTimeString("ru-RU");

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

    const blob     = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    const safeName = note.replace(/[^а-яёa-z0-9_\-]/gi, "_").substring(0, 30);
    a.href         = url;
    a.download     = `snatch_keys_${safeName}_${now.toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// ─── CREATE USER ─────────────────────────────────────
document.getElementById("btn-create-user")?.addEventListener("click", async () => {
    const username = document.getElementById("new-user-name").value.trim();
    const password = document.getElementById("new-user-pass").value;
    const role     = document.getElementById("new-user-role").value;

    if (!username || !password) {
        showToast("Заполните все поля!", true);
        return;
    }

    try {
        const res  = await fetch("/admin/api/users", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${getToken()}`
            },
            body: JSON.stringify({ username, password, role })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Пользователь ${username} создан!`);
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

// ─── KICK / DELETE KEY ───────────────────────────────
window.kickUser = async function (hash) {
    if (!confirm("Удалить этот ключ? Действие необратимо.")) return;
    try {
        await fetch("/admin/api/revoke", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${getToken()}`
            },
            body: JSON.stringify({ hash })
        });
        fetchDashboard();
        showToast("✅ Ключ удалён");
    } catch {
        showToast("Ошибка при удалении!", true);
    }
};

// ─── CHANGE PASSWORD ─────────────────────────────────
window.changeUserPass = async function (userId, username) {
    const newPass = prompt(`Новый пароль для пользователя ${username}:`);
    if (!newPass) return;
    try {
        const res  = await fetch("/admin/api/force_password", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${getToken()}`
            },
            body: JSON.stringify({ userId, newPassword: newPass })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Пароль для ${username} изменён!`);
        } else {
            showToast("Ошибка: " + (data.error || "Неизвестная"), true);
        }
    } catch {
        showToast("Ошибка сети!", true);
    }
};

// ─── DELETE USER ─────────────────────────────────────
window.deleteUserProfile = async function (userId, username) {
    if (!confirm(`⚠️ Удалить пользователя "${username}" навсегда?\n\nВсе его ключи будут удалены.`)) return;
    try {
        const res  = await fetch("/admin/api/delete_user", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  `Bearer ${getToken()}`
            },
            body: JSON.stringify({ userId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Пользователь ${username} удалён!`);
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
    const op = window.currentOperatorsData.find(o => o.keyHash === hash);
    if (!op || !op.details) return;

    const { config, stats } = op.details;
    const profiles = new Set();
    if (config.letters) Object.keys(config.letters).forEach(k => k !== "global" && profiles.add(k));
    Object.keys(config).forEach(k => {
        if (k.startsWith("invites") && k !== "invites") profiles.add(k.replace("invites", ""));
    });
    if ((config.invites && Object.keys(config.invites).length > 0) || (config.letters && config.letters["global"]))
        profiles.add("global");

    let html = `
        <div style="display:flex; gap:16px; margin-bottom:28px; flex-wrap:wrap;">
            <div style="flex:1; min-width:120px; background:var(--surface2); border:1px solid var(--border); border-radius:14px; padding:20px; text-align:center;">
                <div style="font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; font-weight:700;">Чатов отправлено</div>
                <div style="font-size:32px; font-weight:800; color:var(--info);">${stats.chat}</div>
            </div>
            <div style="flex:1; min-width:120px; background:var(--surface2); border:1px solid var(--border); border-radius:14px; padding:20px; text-align:center;">
                <div style="font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; font-weight:700;">Писем отправлено</div>
                <div style="font-size:32px; font-weight:800; color:var(--secondary);">${stats.letters}</div>
            </div>
        </div>
        <h3 style="font-size:15px; color:var(--text-2); margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border); font-weight:700; text-transform:uppercase; letter-spacing:.5px;">Анкеты оператора</h3>
    `;

    if (profiles.size === 0) {
        html += `<p style="color:var(--text-3); text-align:center; padding:32px 0; font-style:italic;">Оператор ещё не настроил ни одной анкеты.</p>`;
    }

    profiles.forEach(pid => {
        let invCount = 0, letCount = 0, invHtml = "", letHtml = "";
        const invKey = pid === "global" ? "invites" : "invites" + pid;
        if (config[invKey]) {
            Object.keys(config[invKey]).forEach(cat => {
                const items = config[invKey][cat];
                if (items?.length) {
                    invCount += items.length;
                    items.forEach(it => {
                        const text = typeof it === "string" ? it : it.text || "[Только фото/видео]";
                        invHtml += `<div style="background:var(--bg2); padding:12px; border-radius:8px; margin-bottom:8px; font-size:13px; border:1px solid var(--border); line-height:1.6;"><b style="color:var(--primary); display:block; margin-bottom:4px; font-size:11px;">[${cat}]</b>${text}</div>`;
                    });
                }
            });
        }
        if (config.letters?.[pid]) {
            config.letters[pid].forEach(it => {
                const text = typeof it === "string" ? it : it.text || "[Только фото/видео]";
                letCount++;
                letHtml += `<div style="background:var(--bg2); padding:12px; border-radius:8px; margin-bottom:8px; font-size:13px; border:1px solid var(--border); line-height:1.6;">${text}</div>`;
            });
        }

        if (invCount > 0 || letCount > 0) {
            const title = pid === "global" ? "🌐 Глобальные настройки" : `👤 Анкета ID: ${pid}`;
            html += `
                <div style="border:1px solid var(--border); background:var(--surface2); border-radius:14px; padding:20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0; color:var(--secondary); font-size:15px;">${title}</h4>
                        <div style="font-size:12px; color:var(--text-3); background:var(--bg2); padding:4px 12px; border-radius:20px; border:1px solid var(--border);">
                            Инвайтов: <b style="color:var(--primary);">${invCount}</b>
                            <span style="margin:0 6px; color:var(--border-2);">|</span>
                            Писем: <b style="color:var(--secondary);">${letCount}</b>
                        </div>
                    </div>
                    <div style="display:flex; gap:20px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:200px; max-height:280px; overflow-y:auto;">
                            <div style="font-size:10px; color:var(--text-3); text-transform:uppercase; font-weight:700; margin-bottom:10px; letter-spacing:1px;">Инвайты</div>
                            ${invHtml || '<div style="color:var(--text-3); font-style:italic; font-size:13px;">Не настроено</div>'}
                        </div>
                        <div style="flex:1; min-width:200px; max-height:280px; overflow-y:auto;">
                            <div style="font-size:10px; color:var(--text-3); text-transform:uppercase; font-weight:700; margin-bottom:10px; letter-spacing:1px;">Письма</div>
                            ${letHtml || '<div style="color:var(--text-3); font-style:italic; font-size:13px;">Не настроено</div>'}
                        </div>
                    </div>
                </div>
            `;
        }
    });

    document.getElementById("op-modal-title").innerText = `Оператор: ${op.operatorId}`;
    document.getElementById("op-modal-content").innerHTML = html;
    document.getElementById("op-modal-overlay").style.display = "flex";
};

// Close modal on overlay click
document.getElementById("op-modal-overlay").addEventListener("click", function (e) {
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
        position:     "fixed",
        bottom:       "24px",
        right:        "24px",
        background:   isError ? "var(--danger)" : "var(--primary)",
        color:        isError ? "#fff" : "#000",
        padding:      "12px 22px",
        borderRadius: "12px",
        fontFamily:   "'Syne', sans-serif",
        fontWeight:   "700",
        fontSize:     "14px",
        zIndex:       "99999",
        boxShadow:    "0 8px 30px rgba(0,0,0,.4)",
        animation:    "fadeUp .3s ease-out both",
        maxWidth:     "320px",
        lineHeight:   "1.4"
    });
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateY(8px)";
        toast.style.transition = "all .3s";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── INIT ─────────────────────────────────────────────
checkAuthState();
