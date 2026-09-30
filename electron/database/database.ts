import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './schema.js';

let db: Database.Database;

export function initDatabase(userDataPath: string) {
  const dbDir = path.join(userDataPath, 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'application.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations to establish relational schema
  runMigrations(db);
}

export function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}
