const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Таблица Пользователей (Теперь с профилем: аватар, ник, телеграм)
  db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT CHECK(role IN ('superadmin', 'admin', 'team', 'translator', 'top')),
        nickname TEXT,
        avatar TEXT,
        telegram TEXT
    )`);

  // 1.5. Таблица связей Топ -> Команды (многие ко многим)
  db.run(`CREATE TABLE IF NOT EXISTS top_teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        top_user_id INTEGER NOT NULL,
        team_user_id INTEGER NOT NULL,
        FOREIGN KEY (top_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (team_user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(top_user_id, team_user_id)
    )`);

  // 2. Таблица Лицензий (Добавлен translator_id - владелец ключа, operator_id - первый использовавший)
  db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT UNIQUE,
        exp_time_ms INTEGER,
        note TEXT,
        creator_id INTEGER,
        translator_id INTEGER,
        operator_id TEXT,
        max_uses INTEGER DEFAULT 1,
        current_uses INTEGER DEFAULT 0
    )`);

  // 3. Создаем Супер-Админа по умолчанию (только если таблица пустая)
  db.get("SELECT id FROM users WHERE role = 'superadmin'", (err, row) => {
    if (!row) {
      const crypto = require("crypto");
      // Генерируем случайный пароль — НЕ хардкодим admin123
      const randomPassword = crypto.randomBytes(8).toString("hex");
      const hash = bcrypt.hashSync(randomPassword, 10);
      db.run(
        "INSERT INTO users (username, password, role, nickname) VALUES (?, ?, ?, ?)",
        ["admin", hash, "superadmin", "Генеральный Босс"],
      );
      console.log("👑 Создан главный админ:");
      console.log(`   Логин:  admin`);
      console.log(`   Пароль: ${randomPassword}`);
      console.log("   ⚠️  Сохраните пароль — он больше не будет показан!");
    }
  });

  // 4. Добавляем колонку is_renamed для принудительного изменения имени (миграция)
  db.run("ALTER TABLE users ADD COLUMN is_renamed INTEGER DEFAULT 0", (err) => {
    // Игнорируем ошибку, если колонка уже существует
  });

  // 5. Добавляем колонки для хранения накопленной статистики по лицензиям
  db.run("ALTER TABLE licenses ADD COLUMN total_chats INTEGER DEFAULT 0", (err) => {});
  db.run("ALTER TABLE licenses ADD COLUMN total_letters INTEGER DEFAULT 0", (err) => {});

  // 6. Добавляем колонку для сохранения состояния ротации инвайтов (JSON)
  db.run("ALTER TABLE licenses ADD COLUMN rotation_state TEXT DEFAULT NULL", (err) => {});
});

module.exports = db;
