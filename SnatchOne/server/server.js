const express = require("express");
const { WebSocketServer } = require("ws");
const app = express();

// ═══════════════════════════════════════════════════════════════════════════
// SNATCH UNIFIED SERVER v3.0
// ═══════════════════════════════════════════════════════════════════════════
// Объединенный сервер включает:
// 1. Admin Panel - Управление лицензиями, пользователями, статистикой
// 2. Bot API - WebSocket сервер для расширения Chrome
// 3. License System - Проверка и управление ключами доступа
// 
// Оптимизирован для 100+ одновременных пользователей
// ═══════════════════════════════════════════════════════════════════════════

// --- ОБХОД БЛОКИРОВОК БРАУЗЕРА (CORS) ---
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Увеличили лимит до 50mb, чтобы огромные базы писем легко пролетали
app.use(express.json({ limit: "50mb" }));
app.use(express.text({ limit: "50mb", type: "*/*" }));

// ================= НАСТРОЙКИ =================
const CONSTANTS = {
  MODE: "chat",
  DELAY_MIN: 5000,
  DELAY_MAX: 10000,
};

const crypto = require("crypto");
const path = require("path");
const jwt = require("jsonwebtoken"); // Для защиты админки
const bcrypt = require("bcryptjs"); // Для паролей
const db = require("./db"); // Подключаем нашу новую базу данных

const JWT_SECRET = process.env.JWT_SECRET || "snatch_super_secret_123";

// ================= ОПТИМИЗАЦИИ ДЛЯ 100+ ПОЛЬЗОВАТЕЛЕЙ =================
const MAX_HISTORY_RECORDS = 1000; // Максимум записей в истории на сессию
const SESSION_CLEANUP_INTERVAL = 3600000; // Очистка каждый час (1 час)
const MAX_SESSION_AGE = 86400000; // Максимальный возраст сессии 24 часа

// ВАЖНО: Мы удалили let LICENSES = new Map(), так как ключи теперь в БД.
// SESSIONS оставляем, так как тут хранятся текущие "онлайн" подключения и таймеры.
const SESSIONS = new Map();

// Функция очистки старых сессий и больших историй
function cleanupSessions() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [authHash, session] of SESSIONS.entries()) {
    // Удаляем отключенные сессии старше 24 часов
    if (!session.ws || session.ws.readyState !== 1) {
      const lastActivity = session.lastActivity || session.stats.date;
      if (now - lastActivity > MAX_SESSION_AGE) {
        SESSIONS.delete(authHash);
        cleaned++;
        continue;
      }
    }
    
    // Ограничиваем размер истории
    if (session.historyChat.size > MAX_HISTORY_RECORDS) {
      const entries = Array.from(session.historyChat.entries());
      entries.sort((a, b) => a[1] - b[1]); // Сортируем по времени
      const toKeep = entries.slice(-MAX_HISTORY_RECORDS);
      session.historyChat.clear();
      toKeep.forEach(([key, val]) => session.historyChat.set(key, val));
    }
    
    if (session.historyLetters.size > MAX_HISTORY_RECORDS) {
      const entries = Array.from(session.historyLetters);
      session.historyLetters.clear();
      entries.slice(-MAX_HISTORY_RECORDS).forEach(item => session.historyLetters.add(item));
    }
    
    if (session.historyMedia.size > MAX_HISTORY_RECORDS) {
      const entries = Array.from(session.historyMedia);
      session.historyMedia.clear();
      entries.slice(-MAX_HISTORY_RECORDS).forEach(item => session.historyMedia.add(item));
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Очищено ${cleaned} неактивных сессий. Активных: ${SESSIONS.size}`);
  }
}

// Запускаем периодическую очистку
setInterval(cleanupSessions, SESSION_CLEANUP_INTERVAL);

// Функция для получения или создания чистой сессии для нового пользователя
function getSession(authHash) {
  if (!SESSIONS.has(authHash)) {
    SESSIONS.set(authHash, {
      config: { invites: {}, letters: {}, settings: {}, stopList: "" },
      stopList: new Set(),
      historyChat: new Map(),
      historyLetters: new Set(),
      historyMedia: new Set(),
      nameCache: new Map(),
      stats: {
        date: new Date().toISOString().split("T")[0],
        chat: 0,
        letters: 0,
        errors: 0,
      },
      rotationState: new Map(),
      pendingRequests: new Map(),
      ws: null, // Сюда позже запишем текущее соединение
      lastActivity: Date.now(),
    });
  } else {
    // Обновляем время последней активности
    SESSIONS.get(authHash).lastActivity = Date.now();
  }
  return SESSIONS.get(authHash);
}

// --- ФУНКЦИИ ОЧИСТКИ ИСТОРИИ (Адаптированные под сессии) ---

// 1. Очистка только чатов (при смене инвайта)
function clearChatHistoryForUser(session, girlId) {
  let countChat = 0;
  let countMedia = 0;

  for (const key of session.historyChat.keys()) {
    if (key.startsWith(girlId + "_")) {
      session.historyChat.delete(key);
      countChat++;
    }
  }

  for (const item of session.historyMedia) {
    if (item.startsWith(girlId + "_")) {
      session.historyMedia.delete(item);
      countMedia++;
    }
  }

  console.log(
    `♻️ РОТАЦИЯ ИНВАЙТА: Для ${girlId} сброшена история чатов (${countChat}) и медиа (${countMedia}).`,
  );
}

// 2. Очистка только писем (при смене письма)
function clearLetterHistoryForUser(session, girlId) {
  let count = 0;
  for (const item of session.historyLetters) {
    if (item.startsWith(girlId + "_")) {
      session.historyLetters.delete(item);
      count++;
    }
  }
  console.log(
    `♻️ РОТАЦИЯ ПИСЕМ: Для ${girlId} сброшена история писем (${count}).`,
  );
}

// --- ЛОГИКА РОТАЦИИ (Адаптированная под сессии) ---

function checkRotationStateForProfile(session, girlId) {
  const cats = [
    "Global chat",
    "Like",
    "View",
    "Wink",
    "Tell me about yourself",
    "Tell me more about yourself",
    "How your day going?",
    "Dont you mind talking bit?",
    "What are you up to?",
    "Post",
  ];

  const personalKey = "invites" + girlId;

  for (const cat of cats) {
    let inviteList = [];
    // Теперь берем конфиг из сессии
    if (
      session.config[personalKey] &&
      session.config[personalKey][cat] &&
      session.config[personalKey][cat].length > 0
    ) {
      inviteList = session.config[personalKey][cat];
    } else if (
      session.config.invites &&
      session.config.invites[cat] &&
      session.config.invites[cat].length > 0
    ) {
      inviteList = session.config.invites[cat];
    }

    if (inviteList.length > 0) {
      const key = `invite_${girlId}_${cat}`;
      processRotationLogic(session, key, inviteList, girlId, "invite");
    }
  }

  let letterList = [];
  if (
    session.config.letters &&
    session.config.letters[girlId] &&
    session.config.letters[girlId].length > 0
  ) {
    letterList = session.config.letters[girlId];
  } else if (
    session.config.letters &&
    session.config.letters["global"] &&
    session.config.letters["global"].length > 0
  ) {
    letterList = session.config.letters["global"];
  }

  if (letterList.length > 0) {
    const key = `letter_${girlId}_main`;
    processRotationLogic(session, key, letterList, girlId, "letter");
  }
}

function processRotationLogic(session, key, list, girlId, type) {
  if (!session.rotationState.has(key)) {
    session.rotationState.set(key, { index: 0, startTime: Date.now() });
    return;
  }

  let state = session.rotationState.get(key);

  if (state.index >= list.length) {
    state.index = 0;
    state.startTime = Date.now();
    return;
  }

  let currentItem = list[state.index];
  let durationMin = 60;

  if (typeof currentItem === "object" && currentItem !== null) {
    const d = parseInt(currentItem.duration);
    if (!isNaN(d) && d > 0) durationMin = d;
  }

  const elapsedMs = Date.now() - state.startTime;
  const limitMs = durationMin * 60 * 1000;

  if (elapsedMs > limitMs) {
    state.index++;
    if (state.index >= list.length) state.index = 0;
    state.startTime = Date.now();

    const nextItem = list[state.index];
    let nextDur = 60;
    if (typeof nextItem === "object" && nextItem !== null) {
      const d = parseInt(nextItem.duration);
      if (!isNaN(d) && d > 0) nextDur = d;
    }

    console.log(
      `🔄 РОТАЦИЯ [${type}]: Анкета ${girlId}. Время вышло! Переход к #${state.index + 1} (${nextDur} мин)`,
    );

    // Передаем сессию в функции очистки
    if (type === "invite") {
      clearChatHistoryForUser(session, girlId);
    } else if (type === "letter") {
      clearLetterHistoryForUser(session, girlId);
    }
  }
}

function getCurrentRotatedItem(
  session,
  girlId,
  list,
  type,
  category = "default",
) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const key = `${type}_${girlId}_${category}`;

  if (!session.rotationState.has(key)) {
    session.rotationState.set(key, { index: 0, startTime: Date.now() });
  }

  const state = session.rotationState.get(key);
  if (state.index >= list.length) {
    state.index = 0;
    state.startTime = Date.now();
  }

  return list[state.index];
}

function checkUtcReset(session) {
  const today = new Date().toISOString().split("T")[0];
  if (session.stats.date !== today) {
    console.log(`📅 Новый день (UTC): Сброс статистики для текущей сессии.`);
    session.stats = { date: today, chat: 0, letters: 0, errors: 0 };
    session.historyChat.clear();
    session.historyLetters.clear();
    session.historyMedia.clear();
  }
}

// =======================================================
// --- АДМИН ПАНЕЛЬ (С БАЗОЙ ДАННЫХ, РОЛЯМИ И ПРОФИЛЯМИ) ---
// =======================================================

app.use("/admin", express.static(path.join(__dirname, "public")));

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Нет доступа" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Токен истек" });
    req.user = user;
    next();
  });
}

app.post("/admin/api/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err || !user)
      return res.status(401).json({ error: "Неверный логин или пароль" });
    if (!bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: "Неверный логин или пароль" });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.json({
      success: true,
      token,
      role: user.role,
      username: user.username,
    });
  });
});

// 3. API: Получить статистику, ключи и данные профиля
app.get("/admin/api/status", authenticateToken, (req, res) => {
  db.get(
    "SELECT nickname, avatar, telegram FROM users WHERE id = ?",
    [req.user.id],
    (err, profile) => {
      let licenseQuery = "SELECT * FROM licenses";
      let params = [];

      if (req.user.role === "team") {
        licenseQuery += " WHERE creator_id = ?";
        params.push(req.user.id);
      } else if (req.user.role === "translator") {
        licenseQuery += " WHERE translator_id = ?";
        params.push(req.user.id);
      }

      db.all(licenseQuery, params, (err, licenses) => {
        let scopedChats = 0,
          scopedLetters = 0,
          activeCount = 0;

        const operators = (licenses || []).map((lic) => {
          const session = SESSIONS.get(lic.key_hash);
          const isOnline = session && session.ws !== null;
          const expSec = Math.max(
            0,
            Math.floor((lic.exp_time_ms - Date.now()) / 1000),
          );

          let details = null;
          if (isOnline) {
            scopedChats += session.stats.chat;
            scopedLetters += session.stats.letters;
            activeCount++;
            details = { stats: session.stats, config: session.config };
          }

          return {
            keyHash: lic.key_hash,
            operatorId: lic.note,
            expSec: expSec,
            isOnline: isOnline,
            details: details,
          };
        });

        const responseData = {
          activeSessions: activeCount,
          globalChats: scopedChats,
          globalLetters: scopedLetters,
          operators,
          role: req.user.role,
          profile: profile || {},
        };

        if (req.user.role === "superadmin") {
          db.all(
            "SELECT id, username, role, nickname FROM users",
            [],
            (err, users) => {
              responseData.users = users;
              res.json(responseData);
            },
          );
        } else {
          res.json(responseData);
        }
      });
    },
  );
});

// --- НОВЫЙ API: Получить всех пользователей (Только для Админов) ---
app.get("/admin/api/all_users", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Нет доступа" });
  }

  // Получаем всех юзеров
  db.all(
    "SELECT id, username, role, nickname, avatar, telegram FROM users",
    [],
    (err, users) => {
      if (err) return res.status(500).json({ error: "Ошибка БД" });

      // Получаем все лицензии, чтобы связать переводчиков и команды
      db.all(
        "SELECT key_hash, creator_id, translator_id FROM licenses",
        [],
        (err, licenses) => {
          res.json({ users, licenses, role: req.user.role });
        },
      );
    },
  );
});

// 4. API: Генерация ключей (Авто-создание аккаунта Переводчика)
app.post("/admin/api/generate", authenticateToken, async (req, res) => {
  if (req.user.role === "team" || req.user.role === "translator") {
    return res
      .status(403)
      .json({ error: "У вас нет прав на выдачу лицензий!" });
  }
  const { days, note, count, ownerId } = req.body;
  const keysCount = parseInt(count) || 1;
  const expTimeMs = Date.now() + (parseInt(days) || 1) * 86400 * 1000;
  const targetOwnerId =
    req.user.role === "superadmin" && ownerId && ownerId !== "me"
      ? ownerId
      : req.user.id;

  const generatedKeys = [];

  const runInsert = (sql, params) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

  try {
    for (let i = 0; i < keysCount; i++) {
      const rawKey = crypto.randomBytes(8).toString("hex").toUpperCase();
      const hash = crypto
        .createHash("sha1")
        .update(rawKey)
        .digest("hex")
        .substring(0, 16);
      const keyNote =
        keysCount > 1 ? `${note || "Operator"} #${i + 1}` : note || "Operator";

      const login = `user_${crypto.randomBytes(3).toString("hex")}`;
      const password = crypto.randomBytes(4).toString("hex");
      const passHash = bcrypt.hashSync(password, 10);

      const transId = await runInsert(
        "INSERT INTO users (username, password, role, nickname) VALUES (?, ?, ?, ?)",
        [login, passHash, "translator", keyNote],
      );

      await runInsert(
        "INSERT INTO licenses (key_hash, exp_time_ms, note, creator_id, translator_id) VALUES (?, ?, ?, ?, ?)",
        [hash, expTimeMs, keyNote, targetOwnerId, transId],
      );

      generatedKeys.push({ key: rawKey, login, password });
    }
    res.json({ success: true, keys: generatedKeys });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

// 5. API: Обновление профиля (Теперь со сменой своего пароля)
app.post("/admin/api/profile", authenticateToken, (req, res) => {
  const { nickname, avatar, telegram, password } = req.body;

  // Если юзер ввел новый пароль, шифруем его и сохраняем
  if (password && password.trim().length > 0) {
    const passHash = bcrypt.hashSync(password, 10);
    db.run(
      "UPDATE users SET nickname = ?, avatar = ?, telegram = ?, password = ? WHERE id = ?",
      [nickname, avatar, telegram, passHash, req.user.id],
      (err) => {
        if (err) return res.status(500).json({ error: "Ошибка сохранения" });
        res.json({ success: true });
      },
    );
  } else {
    // Если поле пароля пустое, обновляем только профиль
    db.run(
      "UPDATE users SET nickname = ?, avatar = ?, telegram = ? WHERE id = ?",
      [nickname, avatar, telegram, req.user.id],
      (err) => {
        if (err) return res.status(500).json({ error: "Ошибка сохранения" });
        res.json({ success: true });
      },
    );
  }
});

// 6. API: Принудительная смена пароля любого юзера (Только SuperAdmin)
app.post("/admin/api/force_password", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "Нет прав" });

  const { userId, newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: "Пустой пароль" });

  const passHash = bcrypt.hashSync(newPassword, 10);
  db.run(
    "UPDATE users SET password = ? WHERE id = ?",
    [passHash, userId],
    (err) => {
      if (err) return res.status(500).json({ error: "Ошибка БД" });
      res.json({ success: true });
    },
  );
});

// 7. API: Удаление пользователя и его ключей (Только SuperAdmin)
app.post("/admin/api/delete_user", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "Нет прав" });

  const { userId } = req.body;

  // Защита: Босс не может удалить сам себя
  if (userId === req.user.id) {
    return res.status(400).json({ error: "Нельзя удалить самого себя!" });
  }

  // 1. Находим все ключи, связанные с этим юзером (созданные им или выданные ему)
  db.all(
    "SELECT key_hash FROM licenses WHERE creator_id = ? OR translator_id = ?",
    [userId, userId],
    (err, licenses) => {
      if (licenses && licenses.length > 0) {
        // 2. Если эти ключи сейчас онлайн - принудительно обрываем им связь (выкидываем из бота)
        licenses.forEach((lic) => {
          if (SESSIONS.has(lic.key_hash)) {
            const session = SESSIONS.get(lic.key_hash);
            if (session.ws) session.ws.close();
            SESSIONS.delete(lic.key_hash);
          }
        });
      }

      // 3. Удаляем сами ключи из базы данных
      db.run(
        "DELETE FROM licenses WHERE creator_id = ? OR translator_id = ?",
        [userId, userId],
        () => {
          // 4. Удаляем профиль пользователя
          db.run("DELETE FROM users WHERE id = ?", [userId], (err) => {
            if (err) return res.status(500).json({ error: "Ошибка БД" });
            res.json({ success: true });
          });
        },
      );
    },
  );
});

app.post("/admin/api/users", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "Нет прав" });
  const { username, password, role } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: "Заполните все поля" });
  const passHash = bcrypt.hashSync(password, 10);
  db.run(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, passHash, role],
    (err) => {
      if (err) return res.status(400).json({ error: "Этот логин уже занят!" });
      res.json({ success: true });
    },
  );
});

app.post("/admin/api/revoke", authenticateToken, (req, res) => {
  const { hash } = req.body;
  db.get(
    "SELECT creator_id, translator_id FROM licenses WHERE key_hash = ?",
    [hash],
    (err, lic) => {
      if (!lic) return res.json({ success: true });
      if (req.user.role === "team" && lic.creator_id !== req.user.id)
        return res.status(403).json({ error: "Это не ваш ключ" });
      if (req.user.role === "translator" && lic.translator_id !== req.user.id)
        return res.status(403).json({ error: "Это не ваш ключ" });

      db.run("DELETE FROM licenses WHERE key_hash = ?", [hash], (err) => {
        if (SESSIONS.has(hash)) {
          const session = SESSIONS.get(hash);
          if (session.ws) session.ws.close();
          SESSIONS.delete(hash);
        }
        res.json({ success: true });
      });
    },
  );
});

// ── Extend license (Admin/SuperAdmin only) ──
app.post("/api/extend", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Нет прав" });
  }
  const { keyHash, days = 30 } = req.body;
  if (!keyHash) return res.status(400).json({ error: "Нет keyHash" });
  const addMs = parseInt(days) * 86400000;
  db.run(
    "UPDATE licenses SET exp_time_ms = MAX(exp_time_ms, ?) + ? WHERE key_hash = ?",
    [Date.now(), addMs, keyHash],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    },
  );
});

// ── License check endpoint (for extension) ──
app.post("/check", (req, res) => {
  res.set("SN-Origin", "ok");
  const authHash = req.query["SN-Auth"];
  const operatorId = req.query["SN-OperatorID"]; // ID оператора из расширения
  if (!authHash)
    return res.status(401).json({ status: false, msg: "No Auth Key" });
  db.get(
    "SELECT * FROM licenses WHERE key_hash = ?",
    [authHash],
    (err, lic) => {
      if (err || !lic)
        return res.status(401).json({ status: false, msg: "Ключ не найден" });
      if (Date.now() > lic.exp_time_ms)
        return res.status(401).json({ status: false, msg: "Лицензия истекла" });

      // Проверка привязки к оператору
      if (lic.operator_id) {
        if (operatorId && lic.operator_id !== operatorId) {
          return res.status(403).json({ 
            status: false, 
            msg: `Этот ключ привязан к другому оператору (${lic.operator_id})!` 
          });
        }
      } else if (operatorId) {
        // Первое использование — привязываем
        db.run(
          "UPDATE licenses SET operator_id = ? WHERE key_hash = ?",
          [operatorId, authHash],
          (updateErr) => {
            if (!updateErr) {
              console.log(`🔗 [/check] Ключ ${authHash.substring(0, 8)}... привязан к оператору ${operatorId}`);
            }
          }
        );
      }

      res.json({
        status: true,
        operator_id: lic.note,
        bound_operator: lic.operator_id || operatorId || null,
        exp_sec: Math.max(0, Math.floor((lic.exp_time_ms - Date.now()) / 1000)),
      });
    },
  );
});

// --- ПРИЕМ НАСТРОЕК ОТ РАСШИРЕНИЯ ---
app.post("/", (req, res) => {
  // ДОБАВЛЕНО: Сразу отдаем заголовок, чтобы расширение понимало, что это наш сервер
  res.set("SN-Origin", "ok");

  const action = req.query["SN-Action"];
  const authHash = req.query["SN-Auth"];
  const operatorId = req.query["SN-OperatorID"]; // ID оператора из расширения

  if (!authHash) {
    return res.status(401).json({ status: false, msg: "No Auth Key" });
  }

  // 1. Ищем ключ в базе данных SQLite
  db.get(
    "SELECT * FROM licenses WHERE key_hash = ?",
    [authHash],
    (err, license) => {
      if (err || !license) {
        return res
          .status(401)
          .json({ status: false, msg: "Ключ не найден или удален!" });
      }

      // 2. Проверяем срок действия
      if (Date.now() > license.exp_time_ms) {
        return res
          .status(401)
          .json({ status: false, msg: "Лицензия истекла!" });
      }

      // ЗАДАЧА #4: Проверка привязки к оператору
      if (license.operator_id) {
        // Ключ уже привязан к оператору
        if (operatorId && license.operator_id !== operatorId) {
          return res.status(403).json({ 
            status: false, 
            msg: `Этот ключ привязан к другому оператору (${license.operator_id})!` 
          });
        }
      } else if (operatorId) {
        // Первое использование - привязываем ключ к оператору (при любом действии)
        db.run(
          "UPDATE licenses SET operator_id = ? WHERE key_hash = ?",
          [operatorId, authHash],
          (updateErr) => {
            if (!updateErr) {
              console.log(`🔗 Ключ ${authHash.substring(0, 8)}... привязан к оператору ${operatorId}`);
            }
          }
        );
      }

      // 3. Получаем онлайн-сессию для этого ключа
      const session = getSession(authHash);

      if (action === "Start") {
        try {
          let bodyData = req.body;
          if (typeof bodyData !== "object") bodyData = JSON.parse(bodyData);

          session.config = bodyData;
          session.stopList.clear();
          if (
            session.config.stopList &&
            typeof session.config.stopList === "string"
          ) {
            const ids = session.config.stopList
              .split(/[\s,\n]+/)
              .filter((s) => s.trim().length > 0);
            ids.forEach((id) => session.stopList.add(String(id)));
          }
          // Выводим имя оператора из базы!
          console.log(
            `\n✅ НАСТРОЙКИ ЗАГРУЖЕНЫ ДЛЯ: ${license.note} (${authHash.substring(0, 8)}...) | Оператор: ${operatorId || 'не указан'}`,
          );
        } catch (e) {
          console.log(`⚠️ Ошибка чтения настроек [${authHash}]:`, e.message);
        }
      }

      // Считаем остаток секунд для отображения в расширении
      const expSec = Math.max(
        0,
        Math.floor((license.exp_time_ms - Date.now()) / 1000),
      );

      res.set("SN-Origin", "ok");
      res.json({
        status: true,
        msg: `Bot connected!`,
        operator_id: license.note,
        bound_operator: license.operator_id || null, // Возвращаем привязанного оператора
        exp_sec: expSec,
        endpoint: (process.env.PUBLIC_URL || "http://localhost:3000") + "/",
        sid: authHash,
        wss_url: (process.env.PUBLIC_URL || "ws://localhost:3000").replace(/^http/, "ws"),
        auth: authHash,
      });
    },
  );
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const server = app.listen(PORT, HOST, () => {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`✅ SNATCH UNIFIED SERVER v3.0 - ЗАПУЩЕН`);
  console.log(`${"═".repeat(70)}`);
  console.log(`📡 Bot API (WebSocket): ${PUBLIC_URL.replace(/^http/, "ws")}`);
  console.log(`🎛️  Admin Panel: ${PUBLIC_URL}/admin`);
  console.log(`🔑 License Check: ${PUBLIC_URL}/check`);
  console.log(`${"─".repeat(70)}`);
  console.log(`   Port: ${PORT} | Host: ${HOST}`);
  console.log(`   Оптимизировано для 100+ пользователей`);
  console.log(`   Логин админки: admin / Пароль: admin123`);
  console.log(`${"═".repeat(70)}\n`);
});
const wss = new WebSocketServer({ server });

function toBase64(text) {
  return Buffer.from(text).toString("base64");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUser(session, id) {
  const name = session.nameCache.get(String(id));
  return name ? `${id} (${name})` : String(id);
}

function detectTrigger(user) {
  const content = (user.message_content || "").toLowerCase().trim();
  const type = (user.message_type || "").toUpperCase();

  // 1. Сначала проверяем точные текстовые совпадения (приоритет)
  if (
    content.includes("tell me about yourself") ||
    content.includes("tell me more about yourself")
  )
    return "Tell me about yourself";
  if (
    content.includes("how your day going") ||
    content.includes("how is your day going")
  )
    return "How your day going?";
  if (
    content.includes("mind talking bit") ||
    content.includes("mind talking a bit")
  )
    return "Dont you mind talking bit?";
  if (content.includes("what are you up to")) return "What are you up to?";

  // 2. Системные типы (WINK, LIKE)
  if (type.includes("WINK") || content.includes("wink")) return "Wink";
  if (type.includes("LIKE") || content.includes("like")) return "Like";

  // 3. ПРОВЕРКА НА ПРОСМОТР ПРОФИЛЯ (View)
  // Если тип SENT_TEXT и текст абсолютно пустой ИЛИ в типе/тексте явно написано view
  if (
    type.includes("VIEW") ||
    content.includes("view") ||
    (type === "SENT_TEXT" && content === "")
  ) {
    return "View";
  }

  return null; // Ничего не подошло -> это обычный чат (пойдет в Global chat)
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (Адаптированные под сессии) ---

function sendRequest(session, ws, payload) {
  return new Promise((resolve) => {
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    payload.id = reqId;

    const tmr = setTimeout(() => {
      if (session.pendingRequests.has(reqId)) {
        session.pendingRequests.delete(reqId);
        resolve(null);
      }
    }, 10000);

    session.pendingRequests.set(reqId, (msg) => {
      clearTimeout(tmr);
      resolve(msg);
    });

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      session.pendingRequests.delete(reqId);
      resolve(null);
    }
  });
}

function getLetterData(session, girlId) {
  let list = null;
  if (
    session.config.letters &&
    session.config.letters[girlId] &&
    Array.isArray(session.config.letters[girlId]) &&
    session.config.letters[girlId].length > 0
  ) {
    list = session.config.letters[girlId];
  } else if (
    session.config.letters &&
    session.config.letters["global"] &&
    session.config.letters["global"].length > 0
  ) {
    list = session.config.letters["global"];
  }

  if (list) {
    const item = getCurrentRotatedItem(session, girlId, list, "letter", "main");
    if (!item) return null;
    if (typeof item === "string") {
      return { text: item, media: [] };
    }
    return { text: item.text || "", media: item.media || [] };
  }
  return null;
}

function getInviteData(session, girlId, triggerCategory = null) {
  const personalKey = "invites" + girlId;
  const categoriesToSearch = triggerCategory
    ? [triggerCategory, "Global chat"]
    : ["Global chat"];

  const findInConfig = (conf) => {
    if (!conf) return null;
    for (const cat of categoriesToSearch) {
      const list = conf[cat];
      if (list && list.length > 0) {
        const rawItem = getCurrentRotatedItem(
          session,
          girlId,
          list,
          "invite",
          cat,
        );
        if (!rawItem) continue;
        let normalizedItem = {};
        if (typeof rawItem === "string") {
          normalizedItem = { text: rawItem, media: null, picFirst: false };
        } else {
          normalizedItem = {
            text: rawItem.text || "",
            media: rawItem.media || null,
            picFirst: !!rawItem.picFirst,
          };
        }
        return { ...normalizedItem, foundCategory: cat };
      }
    }
    return null;
  };

  // Ищем сначала в персональных инвайтах сессии
  const personalResult = findInConfig(session.config[personalKey]);
  if (personalResult) return personalResult;

  // Если нет, ищем в глобальных инвайтах сессии
  const globalResult = findInConfig(session.config.invites);
  if (globalResult) return globalResult;

  return null;
}

// Добавили req, чтобы читать URL
wss.on("connection", (ws, req) => {
  // Вытаскиваем ключ из URL (расширение передает его как ?SN-Auth=...)
  const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const authHash = urlParams.get("SN-Auth");

  if (!authHash) {
    console.log("❌ Отклонено: Нет ключа авторизации");
    return ws.close();
  }

  // Находим сессию этого юзера
  const session = getSession(authHash);
  session.ws = ws; // Привязываем этот сокет к его сессии

  console.log(`[WS] Бот подключен. Ключ: ${authHash.substring(0, 8)}...`);

  const statsInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      const rotationData = {};
      // Берем состояние ротации из личной сессии юзера
      for (const [key, val] of session.rotationState.entries()) {
        rotationData[key] = val;
      }

      // ЗАДАЧА #5: Поддержка онлайн активности
      // Отправляем периодический запрос для поддержания онлайна
      if (session.config.settings && session.config.settings.keepOnline) {
        ws.send(
          JSON.stringify({
            id: "keepalive_" + Date.now(),
            path: "/api/operator/profiles",
            method: "GET",
            headers: {},
          }),
        );
      }

      ws.send(
        JSON.stringify({
          type: "STATS",
          stats: session.stats, // Статистику тоже берем из сессии
          rotation: rotationData,
          dialogsFound: PROCESSED_THIS_SCAN ? PROCESSED_THIS_SCAN.size : 0, // Добавляем количество найденных диалогов
        }),
      );
    }
  }, 2000);

  let isRunning = true;
  let PROCESSED_THIS_SCAN = new Set(); // Переменная для отслеживания обработанных диалогов

  const runLoop = async () => {
    while (isRunning && ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          id: "scan",
          action: "BuildFullTable",
          firstPageOnly: 0,
        }),
      );
      await sleep(15000);
    }
  };
  runLoop();

  ws.on("message", async (data) => {
    try {
      // Обновляем статистику сессии, если наступил новый день
      checkUtcReset(session);
      const msgStr = data.toString();
      const msg = JSON.parse(msgStr);

      if (msg.id && session.pendingRequests.has(msg.id)) {
        const resolve = session.pendingRequests.get(msg.id);
        session.pendingRequests.delete(msg.id);
        resolve(msg);
        return;
      }

      if (msg.type === "CLEAR_HISTORY") {
        session.historyChat.clear();
        session.historyLetters.clear();
        session.historyMedia.clear();
        console.log(
          `\n🧹 ИСТОРИЯ ОЧИЩЕНА ВРУЧНУЮ (Chat, Letters & Media) для оператора!`,
        );
        return;
      }

      if (!isRunning) return;

      // 1. ОТЧЕТ О ДОСТАВКЕ
      if (msg.id && typeof msg.id === "string" && msg.id.startsWith("msg_")) {
        const parts = msg.id.split("_");
        const myId = parts[1];
        const manId = parts[2];

        const historyKey = `${myId}_${manId}`;

        let responseBody = null;
        try {
          responseBody = JSON.parse(
            Buffer.from(msg.body || "", "base64").toString("utf-8"),
          );
        } catch (e) {}

        const responseMessage = responseBody
          ? responseBody.message || responseBody.error || ""
          : "";
        const hasLimitError =
          /limit|action|balance|credits|upgrade|pay|0 actions/i.test(
            responseMessage,
          );
        const isHttpOk = msg.status >= 200 && msg.status < 300;
        const isJsonOk =
          responseBody &&
          (responseBody.status === true ||
            responseBody.status === "true" ||
            responseBody.success === true) &&
          !hasLimitError;

        if (isHttpOk && isJsonOk) {
          console.log(
            `✅ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] УСПЕШНО ДОСТАВЛЕНО`,
          );
        } else {
          console.log(
            `❌ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ОШИБКА: ${responseMessage}`,
          );

          const isStopError = /already received|Restriction/i.test(
            responseMessage,
          );

          if (isStopError) {
            console.log(
              `   ⛔ Запись сохранена в истории, чтобы избежать повторного спама.`,
            );
          } else {
            // Удаляем из истории КОНКРЕТНОЙ сессии
            session.historyChat.delete(historyKey);
            session.historyLetters.delete(historyKey);
            console.log(
              `   ⟲ Удалено из истории (попробуем снова в следующем цикле)`,
            );
          }

          // Плюсуем ошибку в стату сессии
          session.stats.errors++;
        }
        return;
      }

      // 2. ОБРАБОТКА СКАНА
      if (msg.id === "scan") {
        const bodyRaw = Buffer.from(msg.body, "base64").toString("utf-8");
        const users = JSON.parse(bodyRaw);
        if (!users || users.length === 0) return;

        // Умное определение того, кто отправил сообщение
        const isMan = (u) =>
          u.is_male == 1 ||
          u.is_male === true ||
          (u.sender_id &&
            (u.sender_id == u.male_id || u.sender_id == u.man_id));

        const activeGirls = new Set();
        users.forEach((u) => {
          let myId = isMan(u) ? u.recipient_external_id : u.sender_external_id;
          if (myId) activeGirls.add(String(myId));
        });

        // Проверяем ротацию для текущей сессии
        for (const girlId of activeGirls) {
          checkRotationStateForProfile(session, girlId);
        }

        console.log(
          `🔎 [${authHash.substring(0, 8)}] Найдено ${users.length} диалогов.`,
        );

        // Сортировка: Триггеры всегда первыми
        users.sort((a, b) => {
          const aIsTrig = isMan(a) && detectTrigger(a) ? 1 : 0;
          const bIsTrig = isMan(b) && detectTrigger(b) ? 1 : 0;
          return bIsTrig - aIsTrig;
        });

        PROCESSED_THIS_SCAN = new Set(); // Очищаем перед новым сканом

        for (const target of users) {
          if (!isRunning || ws.readyState !== ws.OPEN) break;

          let mName =
            target.man_name || target.male_name || target.name || "Man";
          let wName = target.woman_name || target.female_name || "Me";
          let manId = null,
            myId = null;

          const isManSender = isMan(target);
          if (isManSender) {
            manId = target.sender_external_id;
            myId = target.recipient_external_id;
          } else {
            manId = target.recipient_external_id;
            myId = target.sender_external_id;
          }

          if (!manId || !myId) continue;

          const uniqueScanKey = `${myId}_${manId}`;
          if (PROCESSED_THIS_SCAN.has(uniqueScanKey)) continue;
          PROCESSED_THIS_SCAN.add(uniqueScanKey);

          // Кеш имен для конкретной сессии
          if (mName !== "Man") session.nameCache.set(String(manId), mName);
          if (wName !== "Me") session.nameCache.set(String(myId), wName);

          // Проверяем стоп-лист КОНКРЕТНОЙ сессии
          if (session.stopList.has(String(manId))) continue;

          const historyKey = `${myId}_${manId}`;

          // Берем настройки из КОНКРЕТНОЙ сессии
          const useLetters =
            session.config.settings && session.config.settings.useLetters;
          const letterDelayMin =
            (session.config.settings &&
              parseInt(session.config.settings.letterDelay)) ||
            0;

          const hasChat = session.historyChat.has(historyKey);
          const hasLetter = session.historyLetters.has(historyKey);

          const chatLimit =
            typeof target.message_limit === "number" ? target.message_limit : 1;
          let letterLimit = null;
          if (typeof target.letter_limit === "number")
            letterLimit = target.letter_limit;
          else if (typeof target.letters_limit === "number")
            letterLimit = target.letters_limit;

          if (chatLimit <= 0 && letterLimit === 0) continue;

          // ------------------------------------------
          // ШАГ 1: ЧАТ
          // ------------------------------------------
          let detectedTrigger = null;
          if (isManSender) {
            detectedTrigger = detectTrigger(target);
          }

          if ((!hasChat || detectedTrigger) && chatLimit > 0) {
            if (detectedTrigger) {
              console.log(
                `⚡ ТРИГГЕР ПОСЛЕДНЕГО СООБЩЕНИЯ: ${detectedTrigger} для ${manId}`,
              );
            }

            // Получаем текст инвайта из сессии
            const inviteData = getInviteData(session, myId, detectedTrigger);

            if (inviteData) {
              let text = inviteData.text || "";
              let media = inviteData.media || null;
              let picFirst = inviteData.picFirst || false;

              if (media && media.id) {
                const mediaKey = `${myId}_${manId}_${media.id}`;
                if (session.historyMedia.has(mediaKey)) {
                  console.log(
                    `📷 [${formatUser(session, myId)} -> ${formatUser(session, manId)}] Фото уже было. Шлем только текст.`,
                  );
                  media = null;
                }
              }

              if (text || media) {
                const doSend = async (type, contentData) => {
                  if (!isRunning || ws.readyState !== ws.OPEN) return;
                  const payloadObj = {
                    sender_id: myId,
                    recipient_id: manId,
                    message_content:
                      type === "text" ? contentData : contentData.url,
                    message_type:
                      type === "text"
                        ? "SENT_TEXT"
                        : contentData.type === "video"
                          ? "SENT_VIDEO"
                          : "SENT_IMAGE",
                    chance: true,
                  };
                  if (type !== "text") {
                    payloadObj.content_id = contentData.id;
                    payloadObj.filename = contentData.filename;
                  }
                  const reqId = `msg_${myId}_${manId}_${Date.now()}_C`;
                  ws.send(
                    JSON.stringify({
                      id: reqId,
                      path: "/api/chat/message",
                      method: "POST",
                      body: toBase64(JSON.stringify(payloadObj)),
                      headers: { "Content-Type": "application/json" },
                    }),
                  );

                  if (type !== "text" && contentData.id) {
                    session.historyMedia.add(
                      `${myId}_${manId}_${contentData.id}`,
                    );
                  }
                  console.log(
                    `📨 [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ЧАТ: Отправка (${type})...`,
                  );
                };

                const miniDelay = () =>
                  sleep(Math.floor(Math.random() * 2000) + 2000);
                if (media) {
                  if (picFirst) {
                    await doSend("media", media);
                    await miniDelay();
                    if (text) await doSend("text", text);
                  } else {
                    if (text) await doSend("text", text);
                    await miniDelay();
                    await doSend("media", media);
                  }
                } else {
                  await doSend("text", text);
                }

                session.stats.chat++;
                session.historyChat.set(historyKey, Date.now());
                continue;
              }
            }
          }

          // ------------------------------------------
          // ШАГ 2: ПИСЬМО
          // ------------------------------------------
          if (useLetters && !hasLetter) {
            if (chatLimit > 0) {
              if (!hasChat) continue;
              const chatTime = session.historyChat.get(historyKey) || 0;
              const diffMs = Date.now() - chatTime;
              const requiredDelayMs = letterDelayMin * 60 * 1000;
              if (diffMs < requiredDelayMs) continue;
            }

            let canSendLetter = false;
            try {
              const checkPayload = {
                user_id: myId,
                folder: "dialog",
                man_id: manId,
                page: 1,
              };
              const checkRes = await sendRequest(session, ws, {
                path: "/api/mailbox/mails",
                method: "POST",
                body: toBase64(JSON.stringify(checkPayload)),
                headers: { "Content-Type": "application/json" },
              });
              if (checkRes && checkRes.body) {
                const rJson = JSON.parse(
                  Buffer.from(checkRes.body, "base64").toString("utf-8"),
                );
                if ((rJson?.response?.chat?.letter_limit || 0) > 0)
                  canSendLetter = true;
              }
            } catch (e) {}

            if (!canSendLetter) {
              session.historyLetters.add(historyKey);
            } else {
              const letterData = getLetterData(session, myId);
              if (letterData) {
                const { text, media } = letterData;
                const attachments = (media || []).map((m) => ({
                  id: String(m.id),
                  link: m.url,
                  message_type:
                    m.type === "video" ? "SENT_VIDEO" : "SENT_IMAGE",
                  title:
                    m.filename ||
                    (m.type === "video" ? "video.mp4" : "image.jpg"),
                }));

                const reqId = `msg_${myId}_${manId}_${Date.now()}_L`;
                ws.send(
                  JSON.stringify({
                    id: reqId,
                    path: "/api/mailbox/mail",
                    method: "POST",
                    body: toBase64(
                      JSON.stringify({
                        user_id: myId,
                        recipients: [manId],
                        attachments: attachments,
                        is_send_email: false,
                        message_content: text,
                        message_type: "SENT_TEXT",
                        parent_mail_id: null,
                      }),
                    ),
                    headers: { "Content-Type": "application/json" },
                  }),
                );

                const mediaInfo = attachments.length
                  ? `[+${attachments.length} media]`
                  : "";
                console.log(
                  `✉️ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ПИСЬМО: "${text.substring(0, 20)}..." ${mediaInfo}`,
                );

                session.stats.letters++;
                session.historyLetters.add(historyKey);

                await sleep(2000);
              } else {
                session.historyLetters.add(historyKey);
              }
            }
          }

          let currentDelay = 1000;
          if (!detectedTrigger) {
            const baseDelay = CONSTANTS.DELAY_MIN;
            currentDelay =
              Math.floor(
                Math.random() * (CONSTANTS.DELAY_MAX - baseDelay + 1),
              ) + baseDelay;
          }
          await sleep(currentDelay);
        }
      }
    } catch (e) {
      console.error("Ошибка:", e);
    }
  });

  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "ping" }));
  }, 20000);

  ws.on("close", () => {
    isRunning = false;
    // Очищаем сокет из сессии при отключении
    if (session && session.ws === ws) {
      session.ws = null;
    }
    clearInterval(statsInterval);
    clearInterval(pingInterval);
  });
});
