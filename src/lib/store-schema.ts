import type { DatabaseSync } from "node:sqlite";

export function migrateStore(connection: DatabaseSync) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS practice_products (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('diagnostic','preparation')),
      access TEXT NOT NULL CHECK(access IN ('free','paid')),
      state TEXT NOT NULL CHECK(state IN ('draft','published','archived')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS practice_product_packages (
      product_id TEXT NOT NULL REFERENCES practice_products(id),
      package_id TEXT NOT NULL UNIQUE REFERENCES assessment_packages(id),
      position INTEGER NOT NULL,
      PRIMARY KEY(product_id, position)
    );
    CREATE TABLE IF NOT EXISTS practice_product_access (
      user_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES practice_products(id),
      granted_by TEXT NOT NULL REFERENCES users(id),
      granted_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS question_issue_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      attempt_id TEXT NOT NULL REFERENCES assessment_attempts(id),
      revision_id TEXT NOT NULL REFERENCES question_revisions(id),
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      UNIQUE(user_id, attempt_id, revision_id)
    );
    UPDATE users SET role='student' WHERE role='instructor';
  `);
}
