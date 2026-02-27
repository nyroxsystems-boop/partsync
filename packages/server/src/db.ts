// ─── PartSync Server: SQLite Database Layer ──────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL, FileDiff, LockState, FileVersion, ConflictEvent } from '@partsync/shared';

let db: Database.Database;

export function initDatabase(dbPath?: string): Database.Database {
    const resolvedPath = dbPath || path.join(process.cwd(), 'partsync.db');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(SCHEMA_SQL);

    console.log(`[DB] SQLite initialized at ${resolvedPath}`);
    return db;
}

export function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}

// ─── Diff Operations ────────────────────────────────────────────────────────

export function insertDiff(diff: FileDiff): number {
    const stmt = getDb().prepare(`
    INSERT INTO diffs (file, patch, author, type, timestamp, version, previous_version, compressed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const result = stmt.run(
        diff.file, diff.patch, diff.author, diff.type,
        diff.timestamp, diff.version, diff.previousVersion,
        diff.compressed ? 1 : 0
    );
    return result.lastInsertRowid as number;
}

export function getDiffsByFile(file: string, limit = 100): FileDiff[] {
    const rows = getDb().prepare(`
    SELECT * FROM diffs WHERE file = ? ORDER BY timestamp DESC LIMIT ?
  `).all(file, limit) as any[];
    return rows.map(mapRowToDiff);
}

export function getDiffsSinceVersion(file: string, sinceVersion: string): FileDiff[] {
    // Get all diffs for this file after the given version
    const rows = getDb().prepare(`
    SELECT * FROM diffs WHERE file = ? AND id > (
      SELECT COALESCE(MAX(id), 0) FROM diffs WHERE file = ? AND version = ?
    ) ORDER BY id ASC
  `).all(file, file, sinceVersion) as any[];
    return rows.map(mapRowToDiff);
}

export function getRecentDiffs(limit = 50): FileDiff[] {
    const rows = getDb().prepare(`
    SELECT * FROM diffs ORDER BY timestamp DESC LIMIT ?
  `).all(limit) as any[];
    return rows.map(mapRowToDiff);
}

export function getDiffById(id: number): FileDiff | null {
    const row = getDb().prepare(`SELECT * FROM diffs WHERE id = ?`).get(id) as any;
    return row ? mapRowToDiff(row) : null;
}

export function pruneOldDiffs(file: string, maxKeep = 100): void {
    getDb().prepare(`
    DELETE FROM diffs WHERE file = ? AND id NOT IN (
      SELECT id FROM diffs WHERE file = ? ORDER BY timestamp DESC LIMIT ?
    )
  `).run(file, file, maxKeep);
}

export function getTotalDiffCount(): number {
    const row = getDb().prepare(`SELECT COUNT(*) as cnt FROM diffs`).get() as any;
    return row.cnt;
}

export function getTrackedFileCount(): number {
    const row = getDb().prepare(`SELECT COUNT(DISTINCT file) as cnt FROM diffs`).get() as any;
    return row.cnt;
}

function mapRowToDiff(row: any): FileDiff {
    return {
        id: row.id,
        file: row.file,
        patch: row.patch,
        author: row.author,
        type: row.type,
        timestamp: row.timestamp,
        version: row.version,
        previousVersion: row.previous_version,
        compressed: row.compressed === 1,
    };
}

// ─── Lock Operations ────────────────────────────────────────────────────────

export function upsertLock(lock: LockState): void {
    getDb().prepare(`
    INSERT OR REPLACE INTO locks (file, locked_by, lock_type, since)
    VALUES (?, ?, ?, ?)
  `).run(lock.file, lock.lockedBy, lock.lockType, lock.since);
}

export function removeLock(file: string): void {
    getDb().prepare(`DELETE FROM locks WHERE file = ?`).run(file);
}

export function getAllLocks(): LockState[] {
    const rows = getDb().prepare(`SELECT * FROM locks`).all() as any[];
    return rows.map(row => ({
        file: row.file,
        lockedBy: row.locked_by,
        lockType: row.lock_type,
        since: row.since,
    }));
}

export function removeLocksForClient(clientName: string): void {
    getDb().prepare(`DELETE FROM locks WHERE locked_by = ?`).run(clientName);
}

// ─── File Version Operations ─────────────────────────────────────────────────

export function upsertFileVersion(fv: FileVersion): void {
    getDb().prepare(`
    INSERT OR REPLACE INTO file_versions (file, hash, timestamp)
    VALUES (?, ?, ?)
  `).run(fv.file, fv.hash, fv.timestamp);
}

export function getFileVersion(file: string): FileVersion | null {
    const row = getDb().prepare(`SELECT * FROM file_versions WHERE file = ?`).get(file) as any;
    return row ? { file: row.file, hash: row.hash, timestamp: row.timestamp } : null;
}

export function getAllFileVersions(): Record<string, string> {
    const rows = getDb().prepare(`SELECT file, hash FROM file_versions`).all() as any[];
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.file] = r.hash; });
    return map;
}

// ─── Conflict Operations ─────────────────────────────────────────────────────

export function insertConflict(conflict: ConflictEvent): number {
    const result = getDb().prepare(`
    INSERT INTO conflicts (file, conflict_file, author_a, author_b, timestamp, resolved)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(conflict.file, conflict.conflictFile, conflict.authorA, conflict.authorB,
        conflict.timestamp, conflict.resolved ? 1 : 0);
    return result.lastInsertRowid as number;
}

export function getRecentConflicts(limit = 20): ConflictEvent[] {
    const rows = getDb().prepare(`
    SELECT * FROM conflicts ORDER BY timestamp DESC LIMIT ?
  `).all(limit) as any[];
    return rows.map(row => ({
        id: row.id,
        file: row.file,
        conflictFile: row.conflict_file,
        authorA: row.author_a,
        authorB: row.author_b,
        timestamp: row.timestamp,
        resolved: row.resolved === 1,
    }));
}

// ─── DB Metadata ─────────────────────────────────────────────────────────────

export function getDbSizeBytes(): number {
    try {
        const dbPath = getDb().name;
        const stats = fs.statSync(dbPath);
        return stats.size;
    } catch {
        return 0;
    }
}
