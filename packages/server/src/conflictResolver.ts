// ─── PartSync Server: Conflict Resolver ──────────────────────────────────────

import { FileDiff, ConflictEvent } from '@partsync/shared';
import * as db from './db';

interface PatchRange {
    start: number;
    end: number;
}

/**
 * Attempt to merge two patches targeting the same file.
 * Returns either a merged result or a conflict event.
 */
export function resolveConflict(
    existingDiff: FileDiff,
    incomingDiff: FileDiff,
): { merged: boolean; conflictEvent?: ConflictEvent; conflictFileName?: string } {
    // If patches don't overlap in line ranges, auto-merge is safe
    const existingRanges = extractPatchRanges(existingDiff.patch);
    const incomingRanges = extractPatchRanges(incomingDiff.patch);

    const overlaps = checkOverlap(existingRanges, incomingRanges);

    if (!overlaps) {
        // Safe to auto-merge — no overlapping line ranges
        console.log(`[ConflictResolver] Auto-merge safe for ${incomingDiff.file}`);
        return { merged: true };
    }

    // Overlapping changes — create conflict copy
    const timestamp = Date.now();
    const ext = incomingDiff.file.includes('.') ? incomingDiff.file.split('.').pop() : 'ts';
    const baseName = incomingDiff.file.replace(/\.[^/.]+$/, '');
    const conflictFileName = `${baseName}.conflict-${timestamp}.${ext}`;

    const conflictEvent: ConflictEvent = {
        file: incomingDiff.file,
        conflictFile: conflictFileName,
        authorA: existingDiff.author,
        authorB: incomingDiff.author,
        timestamp,
        resolved: false,
    };

    db.insertConflict(conflictEvent);
    console.log(`[ConflictResolver] CONFLICT on ${incomingDiff.file}: ${existingDiff.author} vs ${incomingDiff.author}`);

    return { merged: false, conflictEvent, conflictFileName };
}

/**
 * Extract line ranges affected by a unified diff patch.
 */
function extractPatchRanges(patch: string): PatchRange[] {
    const ranges: PatchRange[] = [];
    // Match @@ -start,count +start,count @@ patterns
    const hunkRegex = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
    let match: RegExpExecArray | null;

    while ((match = hunkRegex.exec(patch)) !== null) {
        const start = parseInt(match[3], 10);
        const count = parseInt(match[4] || '1', 10);
        ranges.push({ start, end: start + count - 1 });
    }

    // If no hunks found (e.g. diff-match-patch format), treat as full-file overlap
    if (ranges.length === 0) {
        ranges.push({ start: 0, end: Infinity });
    }

    return ranges;
}

/**
 * Check if any ranges from A overlap with any ranges from B.
 */
function checkOverlap(rangesA: PatchRange[], rangesB: PatchRange[]): boolean {
    for (const a of rangesA) {
        for (const b of rangesB) {
            if (a.start <= b.end && b.start <= a.end) {
                return true;
            }
        }
    }
    return false;
}

export function getRecentConflicts(limit = 20): ConflictEvent[] {
    return db.getRecentConflicts(limit);
}
