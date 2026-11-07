import type { DatabaseSync } from "node:sqlite";

export function migrateLearning(c: DatabaseSync) {
  c.exec(`
    CREATE TABLE IF NOT EXISTS learning_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bank_import_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 50), created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS imports_user_time ON bank_import_events(user_id,created_at);
    CREATE TABLE IF NOT EXISTS exam_profiles (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, sections_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bank_questions (
      id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id), visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS question_revisions (
      id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES bank_questions(id), revision INTEGER NOT NULL,
      exam_id TEXT NOT NULL REFERENCES exam_profiles(id), section_key TEXT NOT NULL,
      content_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','review','published','retired')),
      review_note TEXT NOT NULL DEFAULT '', reviewed_by TEXT REFERENCES users(id), created_at INTEGER NOT NULL,
      UNIQUE(question_id,revision)
    );
    CREATE INDEX IF NOT EXISTS bank_owner ON bank_questions(owner_id);
    CREATE TABLE IF NOT EXISTS assessment_packages (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), exam_id TEXT NOT NULL REFERENCES exam_profiles(id),
      title TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
      state TEXT NOT NULL CHECK(state IN ('draft','published','archived')), snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assessment_tasks (
      id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), package_id TEXT NOT NULL REFERENCES assessment_packages(id),
      title TEXT NOT NULL, due_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assessment_attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), package_id TEXT NOT NULL REFERENCES assessment_packages(id),
      task_id TEXT REFERENCES assessment_tasks(id), status TEXT NOT NULL CHECK(status IN ('active','finished')),
      snapshot_json TEXT NOT NULL, answers_json TEXT NOT NULL DEFAULT '{}', timing_json TEXT NOT NULL DEFAULT '{}',
      section_index INTEGER NOT NULL DEFAULT 0, deadline INTEGER, started_at INTEGER NOT NULL, finished_at INTEGER,
      timing_question_id TEXT, last_tick_at INTEGER, option_seed TEXT,
      listening_index INTEGER NOT NULL DEFAULT 0, listening_audio_until INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_assessment_task_attempt ON assessment_attempts(user_id,task_id) WHERE task_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS assessment_responses (
      attempt_id TEXT NOT NULL REFERENCES assessment_attempts(id), revision_id TEXT NOT NULL REFERENCES question_revisions(id),
      selected INTEGER, correct INTEGER NOT NULL, points REAL NOT NULL, max_points REAL NOT NULL, observed_ms INTEGER NOT NULL,
      PRIMARY KEY(attempt_id,revision_id)
    );
    CREATE INDEX IF NOT EXISTS revisions_exam ON question_revisions(exam_id,section_key,state);
    CREATE INDEX IF NOT EXISTS packages_owner ON assessment_packages(owner_id,state);
    CREATE INDEX IF NOT EXISTS assessment_user ON assessment_attempts(user_id,started_at);
    CREATE INDEX IF NOT EXISTS assessment_task ON assessment_attempts(task_id,status);
  `);
  const columns = c.prepare("PRAGMA table_info(assessment_attempts)").all();
  if (!columns.some(column => column.name === "option_seed")) {
    c.exec("ALTER TABLE assessment_attempts ADD COLUMN option_seed TEXT");
  }
  if (!columns.some(column => column.name === "listening_index")) {
    c.exec("ALTER TABLE assessment_attempts ADD COLUMN listening_index INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some(column => column.name === "listening_audio_until")) {
    c.exec("ALTER TABLE assessment_attempts ADD COLUMN listening_audio_until INTEGER");
  }
}
