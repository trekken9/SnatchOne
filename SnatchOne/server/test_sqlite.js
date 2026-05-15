const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS mans (
        man_id TEXT PRIMARY KEY,
        spend REAL DEFAULT 0,
        reg_date TEXT,
        last_updated INTEGER
    )`);

  db.run(
    `INSERT INTO mans (man_id, spend, reg_date, last_updated) VALUES (?, ?, ?, ?)
     ON CONFLICT(man_id) DO UPDATE SET spend = ?, reg_date = ?, last_updated = ?`,
    ["123", 31.8, "2024-01-21", 123456789, 31.8, "2024-01-21", 123456789],
    function (err) {
      if (err) {
        console.error("UPSERT ERROR:", err.message);
      } else {
        console.log("UPSERT SUCCESS. Changes:", this.changes);
        db.get("SELECT * FROM mans", (err, row) => console.log("ROW:", row));
      }
    }
  );
});
