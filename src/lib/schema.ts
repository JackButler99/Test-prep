import type { DatabaseSync } from "node:sqlite";
import { migrateLearning } from "./learning-schema";

/** Additive migration: existing accounts and attempts remain valid. */
export function migratePlatform(connection: DatabaseSync) {
  connection.exec("BEGIN IMMEDIATE");
  try {
  const columns = connection.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!columns.some(c => c.name === "role")) connection.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
  const attempts = connection.prepare("PRAGMA table_info(attempts)").all() as { name: string }[];
  if (!attempts.some(c => c.name === "assignment_id")) connection.exec("ALTER TABLE attempts ADD COLUMN assignment_id TEXT REFERENCES assignments(id)");
  if (!attempts.some(c => c.name === "option_seed")) connection.exec("ALTER TABLE attempts ADD COLUMN option_seed TEXT");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS instructor_requests (
      user_id TEXT PRIMARY KEY REFERENCES users(id), organization TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      classroom_id TEXT NOT NULL REFERENCES classrooms(id), user_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL, PRIMARY KEY(classroom_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), title TEXT NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('listening','structure','reading')), due_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_assignment_attempt ON attempts(user_id,assignment_id) WHERE assignment_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, hypothesis TEXT NOT NULL, surface TEXT NOT NULL DEFAULT 'practice_prompt',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','paused','ended')),
      control_text TEXT NOT NULL, treatment_text TEXT NOT NULL,
      baseline REAL NOT NULL, mde REAL NOT NULL, required_per_arm INTEGER NOT NULL, min_days INTEGER NOT NULL,
      window_days INTEGER NOT NULL DEFAULT 7, started_at INTEGER, ended_at INTEGER,
      stopped_by_plan INTEGER NOT NULL DEFAULT 0, interrupted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_live_experiment ON experiments(surface) WHERE status IN ('running','paused');
    CREATE TABLE IF NOT EXISTS experiment_assignments (
      experiment_id TEXT NOT NULL REFERENCES experiments(id), user_id TEXT NOT NULL REFERENCES users(id),
      variant TEXT NOT NULL CHECK(variant IN ('A','B')), assigned_at INTEGER NOT NULL,
      exposed_at INTEGER, started_at INTEGER, converted_at INTEGER,
      PRIMARY KEY(experiment_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
      target_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS classrooms_owner ON classrooms(owner_id);
    CREATE INDEX IF NOT EXISTS enrollments_user ON enrollments(user_id);
    CREATE INDEX IF NOT EXISTS assignments_class ON assignments(classroom_id);
    CREATE INDEX IF NOT EXISTS experiments_users ON experiment_assignments(user_id,exposed_at);
  `);
  migrateLearning(connection);
  connection.exec("COMMIT");
  } catch (cause) {
    connection.exec("ROLLBACK");
    throw cause;
  }
}
