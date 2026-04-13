const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

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
        CREATE TABLE IF NOT EXISTS produce_listings (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            price TEXT NOT NULL,
            stockUnits INTEGER NOT NULL DEFAULT 0,
            supplier TEXT,
            lotId TEXT,
            packedOn TEXT,
            created_by_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS login_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT,
            success INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_carts (
            email TEXT PRIMARY KEY COLLATE NOCASE,
            payload TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("✅ Local SQLite: database.sqlite file is ready");
};

initDB();

module.exports = {
    run: (sql, params) => db.run(sql, params),
    get: (sql, params) => db.get(sql, params),
    all: (sql, params) => db.all(sql, params),
};