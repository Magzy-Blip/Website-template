const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const database = new DatabaseSync(path.join(__dirname, 'database.sqlite'));

// Adds data to an existing databse and if one doesnt exists it creates one to avoid loss of data.
database.exec(`
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
console.log('Local SQLite: database.sqlite file is ready');

// this is the sequence used to manage data flow from and to he databse fetching saving and reading.
const run = async (sql, params) => {
    const stmt = database.prepare(sql);
    if (params && params.length) stmt.run(...params);
    else stmt.run();
};

const get = async (sql, params) => {
    const stmt = database.prepare(sql);
    if (params && params.length) return stmt.get(...params);
    return stmt.get();
};

const all = async (sql, params) => {
    const stmt = database.prepare(sql);
    if (params && params.length) return stmt.all(...params);
    return stmt.all();
};

module.exports = { run, get, all };
