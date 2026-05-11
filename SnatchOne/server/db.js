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
        role TEXT CHECK(role IN ('superadmin', 'admin', 'team', 'translator')),
        nickname TEXT,
        avatar TEXT,
        telegram TEXT
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
});

module.exports = db;
