// ─── SQLite Schema for PartSync ──────────────────────────────────────────────

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS diffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    patch TEXT NOT NULL,
    author TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'human',
    timestamp INTEGER NOT NULL,
    version TEXT NOT NULL,
    previous_version TEXT NOT NULL,
    compressed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_diffs_file ON diffs(file);
  CREATE INDEX IF NOT EXISTS idx_diffs_timestamp ON diffs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_diffs_file_version ON diffs(file, version);

  CREATE TABLE IF NOT EXISTS locks (
    file TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    lock_type TEXT NOT NULL DEFAULT 'editing',
    since INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS file_versions (
    file TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    conflict_file TEXT NOT NULL,
    author_a TEXT NOT NULL,
    author_b TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_conflicts_file ON conflicts(file);
`;
