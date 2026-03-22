const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

// Initialize the local file-based database
const initDB = async () => {
    db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("✅ Local SQLite: database.sqlite file is ready");
};

initDB();

// Export a helper to run queries
module.exports = {
    run: (sql, params) => db.run(sql, params),
    get: (sql, params) => db.get(sql, params)
};