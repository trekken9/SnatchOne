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
const fs = require("fs"); // Для логирования

process.on("uncaughtException", (err) => {
  console.error("💥 КРИТИЧЕСКАЯ ОШИБКА (Поток упал):", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔋 НЕОБРАБОТАННЫЙ ПРОМИС:", reason);
});

// ================= НАСТРОЙКИ ЛОГИРОВАНИЯ =================
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function getLogStream() {
  const dateStr = new Date().toISOString().split("T")[0];
  const logFilePath = path.join(logsDir, `${dateStr}.log`);
  return fs.createWriteStream(logFilePath, { flags: "a" });
}

// ── OPERATOR LOG: отдельная папка/файл для каждого оператора ──
function getOperatorLogStream(operatorName) {
  if (!operatorName) return null;
  // Очищаем имя оператора от спецсимволов для безопасного использования как имени папки
  const safeName = String(operatorName).replace(/[\/\\:*?"<>|]/g, "_").trim() || "unknown";
  const operatorDir = path.join(logsDir, "operators", safeName);
  if (!fs.existsSync(operatorDir)) {
    fs.mkdirSync(operatorDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().split("T")[0];
  const logFilePath = path.join(operatorDir, `${dateStr}.log`);
  return fs.createWriteStream(logFilePath, { flags: "a" });
}

function writeOperatorLog(operatorName, level, msg) {
  const stream = getOperatorLogStream(operatorName);
  if (!stream) return;
  const date = new Date().toISOString();
  stream.write(`[${date}] [${level}] ${msg}\n`);
  stream.end();
}

// Глобальная функция для записи лога конкретного оператора из любого места кода
global.logForOperator = function(operatorName, level, ...args) {
  const msg = args.map(a =>
    typeof a === "object" ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a)
  ).join(" ");
  writeOperatorLog(operatorName, level, msg);
};

function writeLog(level, args) {
  const date = new Date().toISOString();
  // Форматируем объекты (ошибки и т.д.)
  const msg = args
    .map((arg) =>
      typeof arg === "object"
        ? arg instanceof Error
          ? arg.stack || arg.message
          : JSON.stringify(arg)
        : String(arg),
    )
    .join(" ");
  const logLine = `[${date}] [${level}] ${msg}\n`;
  const stream = getLogStream();
  stream.write(logLine);
  stream.end();
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

console.log = function (...args) {
  writeLog("INFO", args);
  originalConsoleLog.apply(console, args);
};
console.error = function (...args) {
  writeLog("ERROR", args);
  originalConsoleError.apply(console, args);
};
console.warn = function (...args) {
  writeLog("WARN", args);
  originalConsoleWarn.apply(console, args);
};
console.info = function (...args) {
  writeLog("INFO", args);
  originalConsoleInfo.apply(console, args);
};
// =========================================================

const jwt = require("jsonwebtoken"); // Для защиты админки
const bcrypt = require("bcryptjs"); // Для паролей
const db = require("./db"); // Подключаем нашу новую базу данных

const JWT_SECRET = process.env.JWT_SECRET || "snatch_super_secret_123";
if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠️  ВНИМАНИЕ: JWT_SECRET не задан в .env! Используется небезопасный дефолт. В продакшене ОБЯЗАТЕЛЬНО задайте JWT_SECRET.",
  );
}

// ═══════════════════════════════════════════════════════════════════
// ВСТРОЕННЫЙ RATE LIMITER (без внешних зависимостей)
// ═══════════════════════════════════════════════════════════════════
const rateLimitStore = new Map(); // ip -> { count, resetAt }

function makeRateLimiter({ windowMs, max, message }) {
  return function rateLimitMiddleware(req, res, next) {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const now = Date.now();
    let entry = rateLimitStore.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({
        error: message || "Слишком много запросов. Попробуйте позже.",
      });
    }
    next();
  };
}

// Лимиты
const loginLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Слишком много попыток входа. Попробуйте через 15 минут.",
});
const checkLimiter = makeRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: "Слишком много запросов к /check.",
});
const mainLimiter = makeRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: "Слишком много запросов.",
});

// Очистка rateLimitStore раз в час
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) rateLimitStore.delete(ip);
    }
  },
  60 * 60 * 1000,
);

// Константа: максимальное количество ключей за один запрос
const MAX_KEYS_PER_REQUEST = 50;

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
      entries
        .slice(-MAX_HISTORY_RECORDS)
        .forEach((item) => session.historyLetters.add(item));
    }

    if (session.historyMedia.size > MAX_HISTORY_RECORDS) {
      const entries = Array.from(session.historyMedia);
      session.historyMedia.clear();
      entries
        .slice(-MAX_HISTORY_RECORDS)
        .forEach((item) => session.historyMedia.add(item));
    }
  }

  if (cleaned > 0) {
    console.log(
      `🧹 Очищено ${cleaned} неактивных сессий. Активных: ${SESSIONS.size}`,
    );
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
        chatSuccess: 0,
        chatErrors: 0,
        letterSuccess: 0,
        letterErrors: 0,
      },
      totalStats: { chat: 0, letters: 0 }, // Накопленная статистика за всё время
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

// Сохраняем накопленную статистику и состояние ротации в БД
function persistTotalStats(authHash, session) {
  if (!session.totalStats) return;
  // Сериализуем rotationState (Map → JSON)
  let rotationJson = null;
  try {
    if (session.rotationState && session.rotationState.size > 0) {
      const obj = {};
      for (const [key, val] of session.rotationState.entries()) {
        obj[key] = val;
      }
      rotationJson = JSON.stringify(obj);
    }
  } catch (e) {
    console.error("Ошибка сериализации rotationState:", e.message);
  }

  db.run(
    "UPDATE licenses SET total_chats = ?, total_letters = ?, rotation_state = ? WHERE key_hash = ?",
    [session.totalStats.chat, session.totalStats.letters, rotationJson, authHash],
    (err) => { if (err) console.error("Ошибка сохранения статистики:", err.message); }
  );
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

app.post("/admin/api/login", loginLimiter, (req, res) => {
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
    "SELECT nickname, avatar, telegram, is_renamed FROM users WHERE id = ?",
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
      } else if (req.user.role === "top") {
        // Топ видит ключи только своих команд
        licenseQuery +=
          " WHERE creator_id IN (SELECT team_user_id FROM top_teams WHERE top_user_id = ?)";
        params.push(req.user.id);
      }

      db.all(licenseQuery, params, (err, licenses) => {
        let scopedChats = 0,
          scopedLetters = 0,
          activeCount = 0;
        let totalAllChats = 0,
          totalAllLetters = 0;

        const operators = (licenses || []).map((lic) => {
          const session = SESSIONS.get(lic.key_hash);
          const isOnline = session && session.ws !== null;
          const expSec = Math.max(
            0,
            Math.floor((lic.exp_time_ms - Date.now()) / 1000),
          );

          // Накопленная статистика за всё время (из БД + из памяти если онлайн)
          const licTotalChats = isOnline && session.totalStats
            ? session.totalStats.chat
            : (lic.total_chats || 0);
          const licTotalLetters = isOnline && session.totalStats
            ? session.totalStats.letters
            : (lic.total_letters || 0);
          totalAllChats += licTotalChats;
          totalAllLetters += licTotalLetters;

          let details = null;
          if (isOnline) {
            scopedChats += session.stats.chat;
            scopedLetters += session.stats.letters;
            activeCount++;

            // Преобразуем rotationState из Map в объект для передачи клиенту
            const rotationStateObj = {};
            if (session.rotationState && session.rotationState.size > 0) {
              for (const [key, value] of session.rotationState.entries()) {
                rotationStateObj[key] = {
                  index: value.index,
                  startTime: value.startTime,
                  elapsedMs: Date.now() - value.startTime,
                };
              }
            }

            details = {
              stats: session.stats,
              config: session.config,
              rotationState: rotationStateObj,
            };
          }

          return {
            keyHash: lic.key_hash,
            operatorId: lic.note,
            expSec: expSec,
            isOnline: isOnline,
            details: details,
            creatorId: lic.creator_id, // Добавляем для группировки по командам
            totalChats: licTotalChats,
            totalLetters: licTotalLetters,
          };
        });

        const responseData = {
          activeSessions: activeCount,
          globalChats: scopedChats,
          globalLetters: scopedLetters,
          totalAllChats,
          totalAllLetters,
          operators,
          role: req.user.role,
          profile: profile || {},
        };

        // Для роли "Топ" добавляем список команд
        if (req.user.role === "top") {
          db.all(
            `SELECT u.id, u.username, u.nickname, u.avatar 
             FROM users u 
             INNER JOIN top_teams tt ON u.id = tt.team_user_id 
             WHERE tt.top_user_id = ?`,
            [req.user.id],
            (err, teams) => {
              responseData.teams = teams || [];
              res.json(responseData);
            },
          );
        } else if (req.user.role === "superadmin") {
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
// CEO видит всех, Admin видит только свою ветку (creator_id)
app.get("/admin/api/all_users", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Нет доступа" });
  }

  // Фильтрация по иерархии
  let userQuery = "SELECT id, username, role, nickname, avatar, telegram, creator_id FROM users";
  let userParams = [];
  if (req.user.role === "admin") {
    // Админ видит только пользователей, которых создал он сам
    userQuery += " WHERE creator_id = ? OR id = ?";
    userParams = [req.user.id, req.user.id];
  }

  db.all(userQuery, userParams, (err, users) => {
    if (err) return res.status(500).json({ error: "Ошибка БД" });

    let licQuery = "SELECT key_hash, creator_id, translator_id FROM licenses";
    let licParams = [];
    if (req.user.role === "admin") {
      licQuery += " WHERE creator_id = ?";
      licParams = [req.user.id];
    }

    db.all(licQuery, licParams, (err, licenses) => {
      res.json({ users, licenses, role: req.user.role });
    });
  });
});

// 4. API: Генерация ключей (Авто-создание аккаунта Переводчика)
app.post("/admin/api/generate", authenticateToken, async (req, res) => {
  if (req.user.role === "team" || req.user.role === "translator") {
    return res
      .status(403)
      .json({ error: "У вас нет прав на выдачу лицензий!" });
  }
  const { days, count, ownerId } = req.body;
  const note =
    typeof req.body.note === "string"
      ? req.body.note.slice(0, 200)
      : "Operator";
  const keysCount = Math.min(parseInt(count) || 1, MAX_KEYS_PER_REQUEST);
  const safeDaysGen = Math.min(Math.max(parseInt(days) || 1, 1), 365);
  const expTimeMs = Date.now() + safeDaysGen * 86400 * 1000;
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
      const rawKey = crypto.randomBytes(16).toString("hex").toUpperCase(); // 128 бит вместо 64
      const hash = crypto
        .createHash("sha256")
        .update(rawKey)
        .digest("hex")
        .substring(0, 32); // SHA256, 32 символа вместо SHA1/16
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
  let { nickname, avatar, telegram, password } = req.body;

  // Санитизация входных данных
  if (typeof nickname === "string") nickname = nickname.slice(0, 100);
  if (typeof telegram === "string") telegram = telegram.slice(0, 100);
  // avatar — base64 или URL, ограничиваем 500KB
  if (typeof avatar === "string" && avatar.length > 512000) {
    return res
      .status(400)
      .json({ error: "Аватар слишком большой (макс 500KB)" });
  }

  // Функция для завершения обновления профиля и синхронизации имени ключа
  const finishProfileUpdate = (err) => {
    if (err) return res.status(500).json({ error: "Ошибка сохранения" });
    if (req.user.role === "translator") {
      db.run(
        "UPDATE licenses SET note = ? WHERE translator_id = ?",
        [nickname, req.user.id],
        (err2) => {
          res.json({ success: true });
        },
      );
    } else {
      res.json({ success: true });
    }
  };

  // Если юзер ввел новый пароль, шифруем его и сохраняем
  if (password && password.trim().length > 0) {
    const passHash = bcrypt.hashSync(password, 10);
    db.run(
      "UPDATE users SET nickname = ?, avatar = ?, telegram = ?, password = ?, is_renamed = 1 WHERE id = ?",
      [nickname, avatar, telegram, passHash, req.user.id],
      finishProfileUpdate,
    );
  } else {
    // Если поле пароля пустое, обновляем только профиль
    db.run(
      "UPDATE users SET nickname = ?, avatar = ?, telegram = ?, is_renamed = 1 WHERE id = ?",
      [nickname, avatar, telegram, req.user.id],
      finishProfileUpdate,
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
  if (req.user.role !== "superadmin" && req.user.role !== "admin")
    return res.status(403).json({ error: "Нет прав" });
  const { username, password, role } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: "Заполните все поля" });

  // БЕЗОПАСНОСТЬ: Только допустимые роли. Без whitelist можно передать роль "superadmin".
  const ALLOWED_ROLES = ["admin", "team", "translator", "top", "superadmin"];
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Недопустимая роль. Разрешены: ${ALLOWED_ROLES.join(", ")}`,
    });
  }

  // Админ не может создавать superadmin
  if (req.user.role === "admin" && role === "superadmin") {
    return res.status(403).json({ error: "Админ не может создавать CEO" });
  }

  const passHash = bcrypt.hashSync(password, 10);
  db.run(
    "INSERT INTO users (username, password, role, creator_id) VALUES (?, ?, ?, ?)",
    [username, passHash, role, req.user.id],
    (err) => {
      if (err) return res.status(400).json({ error: "Этот логин уже занят!" });
      res.json({ success: true });
    },
  );
});

// 8. API: Получить команды для роли "Топ" (Только SuperAdmin)
app.get("/admin/api/top_teams/:topUserId", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "Нет прав" });

  const topUserId = parseInt(req.params.topUserId);

  // Получаем все команды (team)
  db.all(
    "SELECT id, username, nickname FROM users WHERE role = 'team'",
    [],
    (err, allTeams) => {
      if (err) return res.status(500).json({ error: "Ошибка БД" });

      // Получаем привязанные команды для этого топа
      db.all(
        "SELECT team_user_id FROM top_teams WHERE top_user_id = ?",
        [topUserId],
        (err, linkedTeams) => {
          if (err) return res.status(500).json({ error: "Ошибка БД" });

          const linkedIds = linkedTeams.map((t) => t.team_user_id);
          res.json({
            allTeams: allTeams || [],
            linkedTeams: linkedIds,
          });
        },
      );
    },
  );
});

// 9. API: Привязать команды к роли "Топ" (Только SuperAdmin)
app.post("/admin/api/assign_teams", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "Нет прав" });

  const { topUserId, teamIds } = req.body;

  if (!topUserId || !Array.isArray(teamIds)) {
    return res.status(400).json({ error: "Неверные параметры" });
  }

  // Сначала удаляем все старые связи
  db.run("DELETE FROM top_teams WHERE top_user_id = ?", [topUserId], (err) => {
    if (err) return res.status(500).json({ error: "Ошибка БД" });

    // Если массив пустой - просто возвращаем успех
    if (teamIds.length === 0) {
      return res.json({ success: true });
    }

    // Добавляем новые связи
    const stmt = db.prepare(
      "INSERT INTO top_teams (top_user_id, team_user_id) VALUES (?, ?)",
    );

    let completed = 0;
    let hasError = false;

    teamIds.forEach((teamId) => {
      stmt.run([topUserId, teamId], (err) => {
        if (err && !hasError) {
          hasError = true;
          return res.status(500).json({ error: "Ошибка добавления связи" });
        }

        completed++;
        if (completed === teamIds.length && !hasError) {
          stmt.finalize();
          res.json({ success: true });
        }
      });
    });
  });
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

// ── Get operator key for download (returns original key if available) ──
app.post("/admin/api/get-operator-key", authenticateToken, (req, res) => {
  const { keyHash } = req.body;

  if (!keyHash) {
    return res.status(400).json({ error: "Нет keyHash" });
  }

  // Check if user has access to this key
  db.get(
    "SELECT creator_id, translator_id, note FROM licenses WHERE key_hash = ?",
    [keyHash],
    (err, lic) => {
      if (err || !lic) {
        return res.status(404).json({ error: "Ключ не найден" });
      }

      // Check permissions
      const hasAccess =
        req.user.role === "superadmin" ||
        req.user.role === "admin" ||
        (req.user.role === "team" && lic.creator_id === req.user.id) ||
        (req.user.role === "translator" && lic.translator_id === req.user.id);

      if (!hasAccess) {
        return res.status(403).json({ error: "Нет доступа к этому ключу" });
      }

      // Check if key is currently online and has the original key stored
      const session = SESSIONS.get(keyHash);
      if (session && session.originalKey) {
        // Return the original key if it's stored in session
        return res.json({ key: session.originalKey });
      }

      // If key is not online or original key is not stored, we can't provide it
      // (Original keys are not stored in database for security)
      return res.status(404).json({
        error:
          "Оригинальный ключ недоступен. Ключи доступны только при первой генерации.",
      });
    },
  );
});

// ── Extend license (Admin/SuperAdmin only) ──
app.post("/api/extend", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Нет прав. Продление доступно только Супер Админу." });
  }
  const { keyHash, days = 30 } = req.body;
  const safeDays = Math.min(Math.max(parseInt(days) || 30, 1), 365);
  if (!keyHash) return res.status(400).json({ error: "Нет keyHash" });
  const addMs = safeDays * 86400000;

  db.run(
    "UPDATE licenses SET exp_time_ms = MAX(exp_time_ms, ?) + ? WHERE key_hash = ?",
    [Date.now(), addMs, keyHash],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    },
  );
});

// ══════════════════════════════════════════════════════════
// БЛОК 2: MANS READ-THROUGH CACHE & DECREASE TIME
// ══════════════════════════════════════════════════════════

// ── Read-Through Cache: Получить данные мужчины (balance/dob) ──
// Если данные свежие (< 5 мин) — отдаём из кэша.
// Иначе — fetch к внешнему API с таймаутом 5с, UPSERT в БД.
// ── Синхронизация данных мужчины от расширения ──
app.post("/api/mans/sync", async (req, res) => {
  const { manId, spend, reg_date } = req.body;
  if (!manId) return res.status(400).json({ error: "Нет man_id" });

  const numSpend = parseFloat(spend) || 0;
  const now = Date.now();

  db.run(
    `REPLACE INTO mans (man_id, spend, reg_date, last_updated) VALUES (?, ?, ?, ?)`,
    [manId, numSpend, reg_date || null, now],
    (err) => {
      if (err) {
        console.error("❌ Ошибка синхронизации mans:", err);
        return res.status(500).json({ error: "DB Error" });
      }
      res.json({ success: true });
    }
  );
});

// Сохраняем старый GET на всякий случай для админки, если потребуется читать из нашей БД
app.get("/api/mans/:id", async (req, res) => {
  const manId = req.params.id;
  db.get("SELECT * FROM mans WHERE man_id = ?", [manId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Нет данных" });
    res.json(row);
  });
});

// ── Список мужчин с фильтрацией (для таблицы в админке) ──
app.get("/api/mans", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Нет доступа" });
  }

  const { search, min_spend, max_spend, from_date, to_date } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (search) {
    where.push("man_id LIKE ?");
    params.push(`%${search}%`);
  }
  if (min_spend) {
    where.push("spend >= ?");
    params.push(parseFloat(min_spend));
  }
  if (max_spend) {
    where.push("spend <= ?");
    params.push(parseFloat(max_spend));
  }
  if (from_date) {
    where.push("reg_date >= ?");
    params.push(from_date);
  }
  if (to_date) {
    where.push("reg_date <= ?");
    params.push(to_date);
  }

  const whereClause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";

  // Получаем общее количество
  db.get(`SELECT COUNT(*) as total FROM mans ${whereClause}`, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: "Ошибка БД" });

    const total = countRow?.total || 0;

    db.all(
      `SELECT * FROM mans ${whereClause} ORDER BY spend DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "Ошибка БД" });
        res.json({
          mans: rows || [],
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        });
      }
    );
  });
});

// ── Decrease license time (CEO only) ──
app.post("/api/decrease-time", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Нет прав. Откат доступен только CEO." });
  }
  const { keyHash, days = 1 } = req.body;
  const safeDays = Math.min(Math.max(parseInt(days) || 1, 1), 365);
  if (!keyHash) return res.status(400).json({ error: "Нет keyHash" });
  const subtractMs = safeDays * 86400000;

  db.run(
    "UPDATE licenses SET exp_time_ms = exp_time_ms - ? WHERE key_hash = ?",
    [subtractMs, keyHash],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    }
  );
});

// ── License check endpoint (for extension) ──
// ── Быстрая read-only проверка: кому принадлежит ключ (без привязки) ──
// Расширение вызывает этот endpoint ПЕРЕД тем как давать доступ новому оператору.
// Никаких сайд-эффектов — только чтение.
// Проверка ключа БЕЗ привязки к operator_id — используется расширением
// когда нет открытой вкладки alpha.date (нельзя получить operator_id через alphaFetchViaAnyTab).
// Возвращает: status, bound (есть ли привязка), exp_sec.
// НЕ привязывает и НЕ обновляет operator_id.
app.post("/api/ping-key", checkLimiter, (req, res) => {
  res.set("SN-Origin", "ok");
  const { authHash } = extractSnParams(req);
  if (!authHash)
    return res.status(401).json({ status: false, msg: "No Auth Key" });

  db.get(
    "SELECT key_hash, exp_time_ms, operator_id, note FROM licenses WHERE key_hash = ?",
    [authHash],
    (err, lic) => {
      if (err || !lic)
        return res
          .status(401)
          .json({ status: false, msg: "Ключ не найден или удалён!" });
      if (Date.now() > lic.exp_time_ms)
        return res
          .status(401)
          .json({ status: false, msg: "Лицензия истекла!" });

      const expSec = Math.max(
        0,
        Math.floor((lic.exp_time_ms - Date.now()) / 1000),
      );
      return res.json({
        status: true,
        bound: !!lic.operator_id,
        operator_id: lic.note,
        exp_sec: expSec,
      });
    },
  );
});

app.post("/api/whohas", checkLimiter, (req, res) => {
  res.set("SN-Origin", "ok");
  const { authHash, operatorId } = extractSnParams(req);
  if (!authHash)
    return res.status(401).json({ status: false, msg: "No Auth Key" });

  db.get(
    "SELECT key_hash, exp_time_ms, operator_id, note FROM licenses WHERE key_hash = ?",
    [authHash],
    (err, lic) => {
      if (err || !lic)
        return res.status(401).json({ status: false, msg: "Ключ не найден" });
      if (Date.now() > lic.exp_time_ms)
        return res.status(401).json({ status: false, msg: "Лицензия истекла" });

      // Нет привязки — ключ свободен
      if (!lic.operator_id) {
        return res.json({ status: true, bound: false, match: true });
      }

      // Есть привязка — проверяем совпадение
      const incomingId = String(operatorId || "").trim();
      const match = incomingId && lic.operator_id === incomingId;
      return res.json({
        status: match,
        bound: true,
        match,
        msg: match ? "OK" : `Этот ключ принадлежит другому аккаунту.`,
      });
    },
  );
});

// Извлекает SN-Auth и SN-OperatorID из заголовков (приоритет) или query.
// Ключ в URL логируется nginx/apache — заголовки безопаснее.
function extractSnParams(req) {
  return {
    authHash: req.headers["sn-auth"] || req.query["SN-Auth"] || null,
    operatorId:
      req.headers["sn-operatorid"] || req.query["SN-OperatorID"] || null,
    action: req.headers["sn-action"] || req.query["SN-Action"] || null,
  };
}

app.post("/check", checkLimiter, (req, res) => {
  res.set("SN-Origin", "ok");
  const { authHash, operatorId } = extractSnParams(req);
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

      const opIdStr = String(operatorId).trim();
      if (
        !operatorId ||
        opIdStr === "" ||
        opIdStr === "null" ||
        opIdStr === "undefined"
      ) {
        return res.status(400).json({
          status: false,
          msg: "ОШИБКА: Не передан ID оператора! Перелогиньтесь на сайте.",
        });
      }

      if (lic.operator_id) {
        if (lic.operator_id !== opIdStr) {
          return res.status(403).json({
            status: false,
            msg: `Доступ запрещен! Этот ключ уже привязан к другому аккаунту (ID: ${lic.operator_id}).`,
          });
        }
      } else {
        db.run(
          "UPDATE licenses SET operator_id = ? WHERE key_hash = ?",
          [opIdStr, authHash],
          (updateErr) => {
            if (!updateErr) {
              console.log(
                `🔗 [/check] Ключ ${authHash.substring(0, 8)}... НАВСЕГДА привязан к оператору ${opIdStr}`,
              );
            }
          },
        );
        lic.operator_id = opIdStr;
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
app.post("/", mainLimiter, (req, res) => {
  // ДОБАВЛЕНО: Сразу отдаем заголовок, чтобы расширение понимало, что это наш сервер
  res.set("SN-Origin", "ok");

  const { action, authHash, operatorId } = extractSnParams(req);

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

      // ЗАДАЧА #4: ЖЕСТКАЯ ПРОВЕРКА ID
      const incomingOpId = String(operatorId || "").trim();

      // Если в БД уже есть привязка, а то что пришло — не совпадает или пустое
      if (license.operator_id) {
        if (!incomingOpId || license.operator_id !== incomingOpId) {
          console.log(
            `[!] Блокировка: Ключ ${authHash} пытаются юзать на ${incomingOpId} вместо ${license.operator_id}`,
          );
          return res.status(403).json({
            status: false,
            msg: "Критическая ошибка: Ключ привязан к другому аккаунту!",
          });
        }
      } else if (
        incomingOpId &&
        incomingOpId !== "null" &&
        incomingOpId !== "undefined" &&
        incomingOpId !== ""
      ) {
        // Если привязки нет — привязываем ПЕРВОГО, кто зашел с этим ключом
        db.run("UPDATE licenses SET operator_id = ? WHERE key_hash = ?", [
          incomingOpId,
          authHash,
        ]);
        console.log(
          `[+] Ключ ${authHash} успешно привязан к ID: ${incomingOpId}`,
        );
      } else {
        // Если привязки нет и ID некорректный — не даем работать
        return res.status(400).json({
          status: false,
          msg: "ОШИБКА: Не передан ID оператора!",
        });
      }

      // 3. Получаем онлайн-сессию для этого ключа
      const session = getSession(authHash);

      // Загружаем накопленную статистику из БД если сессия только что создана
      if (!session.totalStatsLoaded) {
        session.totalStatsLoaded = true;
        if (license.total_chats || license.total_letters) {
          session.totalStats = {
            chat: license.total_chats || 0,
            letters: license.total_letters || 0,
          };
        }
        // Восстанавливаем состояние ротации из БД (чтобы продолжить с того же инвайта)
        if (license.rotation_state) {
          try {
            const savedRotation = JSON.parse(license.rotation_state);
            for (const [key, val] of Object.entries(savedRotation)) {
              session.rotationState.set(key, val);
            }
            console.log(`♻️ Восстановлена ротация для ${license.note || authHash.substring(0, 8)}: ${Object.keys(savedRotation).length} записей`);
          } catch (e) {
            console.error("Ошибка восстановления rotationState:", e.message);
          }
        }
        // Запоминаем имя оператора для логирования
        session.operatorName = license.note || authHash.substring(0, 8);
      }

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
            `\n✅ НАСТРОЙКИ ЗАГРУЖЕНЫ ДЛЯ: ${license.note} (${authHash.substring(0, 8)}...) | Оператор: ${operatorId || "не указан"}`,
          );
          // Лог в папку оператора
          global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}] ✅ Подключился. Оператор ID: ${operatorId || "не указан"}. Ключ: ${authHash.substring(0, 8)}...`);
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
        endpoint: (process.env.PUBLIC_URL || "https://snat4.com") + "/",
        sid: authHash,
        wss_url: (process.env.PUBLIC_URL || "wss://snat4.com").replace(
          /^http/,
          "ws",
        ),
        auth: authHash,
      });
    },
  );
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.PUBLIC_URL || `https://snat4.com`;

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
  // Получаем реальный IP через Nginx
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const authHash = urlParams.get("SN-Auth");

  if (!authHash) {
    console.log(`❌ [${ip}] Отклонено: Нет ключа в URL`);
    return ws.close();
  }

  const session = getSession(authHash);
  session.ws = ws;
  session.connectedAt = Date.now();

  console.log(
    `🌐 [${ip}] ПОДКЛЮЧЕНИЕ: Ключ ${authHash.substring(0, 8)}... (Session: ${SESSIONS.size})`,
  );
  // Лог подключения в папку оператора
  if (session.operatorName) {
    global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}] 🌐 WS подключение установлено. IP: ${ip}`);
  }

  // Добавляем обработчик ошибок самого сокета
  ws.on("error", (err) => {
    console.error(
      `🔌 ОШИБКА СОКЕТА [${authHash.substring(0, 8)}]:`,
      err.message,
    );
    global.logForOperator(session.operatorName, "ERROR",
      `🔌 [${authHash.substring(0, 8)}] ОШИБКА СОКЕТА: ${err.message} (code: ${err.code || "нет"})`,
    );
  });

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
      // pong
      if (msg.type === "PONG") {
        return;
      }

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
          global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}] ✅ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] УСПЕШНО ДОСТАВЛЕНО`);
          // Учитываем тип (чат или письмо) для детальной статистики
          if (session.stats) {
            if (msg.type === "letter" || (session._lastSendType === "letter")) {
              session.stats.letterSuccess = (session.stats.letterSuccess || 0) + 1;
            } else {
              session.stats.chatSuccess = (session.stats.chatSuccess || 0) + 1;
            }
          }
        } else {
          console.log(
            `❌ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ОШИБКА: ${responseMessage}`,
          );
          global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}] ❌ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ОШИБКА: ${responseMessage}`);
          if (session.stats) {
            if (msg.type === "letter" || (session._lastSendType === "letter")) {
              session.stats.letterErrors = (session.stats.letterErrors || 0) + 1;
            } else {
              session.stats.chatErrors = (session.stats.chatErrors || 0) + 1;
            }
          }

          const isStopError = /already received|Restriction/i.test(
            responseMessage,
          );

          if (isStopError) {
            console.log(
              `   ⛔ Запись сохранена в истории, чтобы избежать повторного спама.`,
            );
            global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}]    ⛔ Запись сохранена в истории`);
          } else {
            // Удаляем из истории КОНКРЕТНОЙ сессии
            session.historyChat.delete(historyKey);
            session.historyLetters.delete(historyKey);
            console.log(
              `   ⟲ Удалено из истории (попробуем снова в следующем цикле)`,
            );
            global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}]    ⟲ Удалено из истории (попробуем снова в следующем цикле)`);
          }

          // Плюсуем ошибку в стату сессии
          if (session.stats) {
            session.stats.errors++;
          }
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

        // Считаем уникальные диалоги сразу для лога и статистики
        const uniqueScanIds = new Set(
          users.map((u) => {
            const isM = isMan(u);
            const mid = isM ? u.sender_external_id : u.recipient_external_id;
            const rid = isM ? u.recipient_external_id : u.sender_external_id;
            return `${rid}_${mid}`;
          }),
        );

        console.log(
          `🔎 [${authHash.substring(0, 8)}] Найдено ${uniqueScanIds.size} уникальных диалогов.`,
        );
        global.logForOperator(session.operatorName, "INFO", `🔎 [${authHash.substring(0, 8)}] Найдено ${uniqueScanIds.size} уникальных диалогов.`);

        // Сортировка: Триггеры всегда первыми
        users.sort((a, b) => {
          const aIsTrig = isMan(a) && detectTrigger(a) ? 1 : 0;
          const bIsTrig = isMan(b) && detectTrigger(b) ? 1 : 0;
          return bIsTrig - aIsTrig;
        });

        const processedInThisLoop = new Set();
        PROCESSED_THIS_SCAN = uniqueScanIds; // Сохраняем для отправки в STATS

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
          if (processedInThisLoop.has(uniqueScanKey)) continue;
          processedInThisLoop.add(uniqueScanKey);

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
                session.stats.chatSuccess = (session.stats.chatSuccess || 0) + 1;
                session._lastSendType = "chat";
                if (!session.totalStats) session.totalStats = { chat: 0, letters: 0 };
                session.totalStats.chat++;
                persistTotalStats(authHash, session);
                const mediaStr = media ? ` [+1 media]` : "";
                global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}] 📨 [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ЧАТ: "${(text || "").substring(0, 30)}..."${mediaStr}`);
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
                session.stats.letterSuccess = (session.stats.letterSuccess || 0) + 1;
                session._lastSendType = "letter";
                if (!session.totalStats) session.totalStats = { chat: 0, letters: 0 };
                session.totalStats.letters++;
                persistTotalStats(authHash, session);
                global.logForOperator(session.operatorName, "INFO", `[${authHash.substring(0, 8)}] ✉️ [${formatUser(session, myId)} -> ${formatUser(session, manId)}] ПИСЬМО: "${text.substring(0, 20)}..." ${mediaInfo}`);
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
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "HBT",
          timestamp: Date.now(),
        }),
      );
    }
  }, 30000);

  ws.on("close", (code, reason) => {
    isRunning = false;
    if (session && session.ws === ws) {
      session.ws = null;
      // Сохраняем ротацию и статистику в БД при дисконнекте
      persistTotalStats(authHash, session);
    }
    clearInterval(statsInterval);
    clearInterval(pingInterval);

    // Расшифровка кодов закрытия WebSocket
    const closeCodeMap = {
      1000: "Нормальное закрытие (клиент/сервер закрыл сам)",
      1001: "Endpoint уходит (CloudFlare/Nginx перезапуск прокси)",
      1002: "Ошибка протокола",
      1003: "Неподдерживаемый тип данных",
      1005: "Нет кода закрытия (обрыв без кода — обычно клиент закрыл вкладку)",
      1006: "Аномальное закрытие (обрыв соединения — тайм-аут Nginx/CF или сеть)",
      1007: "Невалидные данные",
      1008: "Нарушение политики",
      1009: "Сообщение слишком большое",
      1010: "Расширение не согласовано",
      1011: "Внутренняя ошибка сервера",
      1012: "Сервер перезапускается",
      1013: "Попробуйте позже",
      1014: "Плохой шлюз",
      1015: "TLS ошибка рукопожатия",
    };
    const codeDesc = closeCodeMap[code] || "Неизвестный код";

    // Определяем вероятную сторону разрыва
    let sideDiag = "";
    if (code === 1000) sideDiag = "🟢 Сторона: нормальное завершение";
    else if (code === 1001) sideDiag = "🔵 Сторона: СЕРВЕР (прокси/CF перезапуск)";
    else if (code === 1005) sideDiag = "🟡 Сторона: КЛИЕНТ (закрыл вкладку / сеть клиента)";
    else if (code === 1006) sideDiag = "🔴 Сторона: СЕТЬ (тайм-аут CF/Nginx или обрыв интернета у клиента)";
    else if (code >= 1011 && code <= 1014) sideDiag = "🔴 Сторона: СЕРВЕР (ошибка сервера)";
    else sideDiag = "⚪ Сторона: не определена";

    const reasonStr = reason?.toString() || "причина не указана";
    const uptime = session?.connectedAt ? Math.floor((Date.now() - session.connectedAt) / 1000) : null;
    const uptimeStr = uptime !== null ? `| Время сессии: ${uptime}с` : "";

    const disconnectMsg = `📡 [${authHash.substring(0, 8)}] ДИСКОННЕКТ! Код: ${code} | Причина: ${reasonStr}`;
    const detailMsg = `   ↳ ${codeDesc} | ${sideDiag} ${uptimeStr}`;

    console.log(disconnectMsg);
    console.log(detailMsg);

    global.logForOperator(session.operatorName, "INFO", disconnectMsg);
    global.logForOperator(session.operatorName, "INFO", detailMsg);
  });
});

// ══════════════════════════════════════════════════════════
// FIX 5: API — получить логи конкретного оператора (по keyHash)
// ══════════════════════════════════════════════════════════
app.get("/admin/api/operator-logs/:keyHash", authenticateToken, (req, res) => {
  const { keyHash } = req.params;
  if (!keyHash) return res.status(400).json({ error: "Нет keyHash" });

  db.get("SELECT creator_id, translator_id, note FROM licenses WHERE key_hash = ?", [keyHash], (err, lic) => {
    if (err || !lic) return res.status(404).json({ error: "Ключ не найден" });

    const hasAccess =
      req.user.role === "superadmin" ||
      req.user.role === "admin" ||
      (req.user.role === "team" && lic.creator_id === req.user.id) ||
      (req.user.role === "translator" && lic.translator_id === req.user.id);

    if (!hasAccess) return res.status(403).json({ error: "Нет доступа" });

    const operatorName = lic.note;
    if (!operatorName) return res.json({ logs: [] });

    const safeName = String(operatorName).replace(/[\/\\:*?"<>|]/g, "_").trim() || "unknown";
    const operatorDir = path.join(logsDir, "operators", safeName);

    if (!fs.existsSync(operatorDir)) return res.json({ logs: [] });

    // Читаем все лог-файлы этого оператора (последние 3 дня)
    try {
      const files = fs.readdirSync(operatorDir)
        .filter(f => f.endsWith(".log"))
        .sort()
        .slice(-3); // последние 3 файла

      const allLines = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(operatorDir, file), "utf-8");
        allLines.push(...content.split("\n").filter(l => l.trim()));
      }

      // Возвращаем последние 500 строк
      const lines = allLines.slice(-500);
      res.json({ logs: lines, operatorName });
    } catch (e) {
      res.json({ logs: [], error: e.message });
    }
  });
});

// ══════════════════════════════════════════════════════════
// FIX 7: ANNOUNCEMENTS — таблица создаётся в db.js, но API здесь
// ══════════════════════════════════════════════════════════

// Создаём таблицу объявлений если не существует
db.run(`CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_by INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  is_active INTEGER DEFAULT 1
)`);

// Таблица для записи кто уже видел объявление
db.run(`CREATE TABLE IF NOT EXISTS announcement_views (
  announcement_id INTEGER,
  user_id INTEGER,
  viewed_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  PRIMARY KEY (announcement_id, user_id)
)`);

// CEO создаёт объявление
app.post("/admin/api/announcements", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Только CEO может создавать объявления" });
  }
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: "Текст не может быть пустым" });

  db.run(
    "INSERT INTO announcements (message, created_by) VALUES (?, ?)",
    [message.trim(), req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Получить активное объявление (для текущего пользователя — которое он ещё не видел)
app.get("/admin/api/announcements/active", authenticateToken, (req, res) => {
  db.get(
    `SELECT a.* FROM announcements a
     WHERE a.is_active = 1
       AND a.id NOT IN (
         SELECT announcement_id FROM announcement_views WHERE user_id = ?
       )
     ORDER BY a.created_at DESC LIMIT 1`,
    [req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ announcement: row || null });
    }
  );
});

// Пользователь отмечает объявление как прочитанное
app.post("/admin/api/announcements/:id/view", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id);
  db.run(
    "INSERT OR IGNORE INTO announcement_views (announcement_id, user_id) VALUES (?, ?)",
    [id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    }
  );
});

// Получить список всех объявлений (только CEO)
app.get("/admin/api/announcements", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Нет доступа" });
  db.all("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ announcements: rows || [] });
  });
});

// Деактивировать объявление (CEO)
app.post("/admin/api/announcements/:id/deactivate", authenticateToken, (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Нет доступа" });
  db.run("UPDATE announcements SET is_active = 0 WHERE id = ?", [parseInt(req.params.id)], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true });
  });
});
