// ─── PartSync Server: Diff Store ─────────────────────────────────────────────

import { FileDiff, MAX_DIFF_HISTORY } from '@partsync/shared';
import * as db from './db';

export function storeDiff(diff: FileDiff): number {
    const id = db.insertDiff(diff);

    // Update file version tracking
    db.upsertFileVersion({
        file: diff.file,
        hash: diff.version,
        timestamp: diff.timestamp,
    });

    // Prune old diffs beyond the limit
    db.pruneOldDiffs(diff.file, MAX_DIFF_HISTORY);

    console.log(`[DiffStore] Stored diff #${id} for ${diff.file} by ${diff.author} (${diff.type})`);
    return id;
}

export function getDiffsForFile(file: string, sinceVersion?: string): FileDiff[] {
    if (sinceVersion) {
        return db.getDiffsSinceVersion(file, sinceVersion);
    }
    return db.getDiffsByFile(file);
}

export function getRecentDiffs(limit = 50): FileDiff[] {
    return db.getRecentDiffs(limit);
}

export function getDiffById(id: number): FileDiff | null {
    return db.getDiffById(id);
}

export function getFileVersion(file: string) {
    return db.getFileVersion(file);
}

export function getAllFileVersions(): Record<string, string> {
    return db.getAllFileVersions();
}
