import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migratePlatform } from "./schema";

let singleton: DatabaseSync | undefined;
export function dataDirectory() {
  return process.env.DATA_DIR || join(process.cwd(), "data");
}

export function db(): DatabaseSync {
  if (singleton) return singleton;
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  const connection = new DatabaseSync(join(directory, "app.sqlite"));
  connection.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('full', 'practice')),
      section TEXT, status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
      section_index INTEGER NOT NULL, started_at INTEGER NOT NULL,
      deadline INTEGER, finished_at INTEGER, answers TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS attempts_user_idx ON attempts(user_id, started_at DESC);
  `);
  try { migratePlatform(connection); }
  catch (cause) { connection.close(); throw cause; }
  singleton = connection;
  return connection;
}

export function transaction<T>(work: () => T): T {
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}
