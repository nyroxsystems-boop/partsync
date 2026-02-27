// ─── PartSync CLI: Diff Engine ────────────────────────────────────────────────

import DiffMatchPatch from 'diff-match-patch';
import crypto from 'crypto';
import zlib from 'zlib';

const dmp = new DiffMatchPatch();

/**
 * Create a patch string from old content → new content.
 */
export function createPatch(oldContent: string, newContent: string): string {
    const diffs = dmp.diff_main(oldContent, newContent);
    dmp.diff_cleanupSemantic(diffs);
    const patches = dmp.patch_make(oldContent, diffs);
    return dmp.patch_toText(patches);
}

/**
 * Apply a patch string to content.
 * Returns the patched content and whether it was fully successful.
 */
export function applyPatch(content: string, patchText: string): { result: string; success: boolean } {
    const patches = dmp.patch_fromText(patchText);
    const [result, results] = dmp.patch_apply(patches, content);
    const success = results.every((r: boolean) => r);
    return { result: result as string, success };
}

/**
 * Generate a SHA-256 hash of content for version tracking.
 */
export function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Compress a patch string using gzip.
 */
export function compressPatch(patch: string): Buffer {
    return zlib.gzipSync(Buffer.from(patch, 'utf8'));
}

/**
 * Decompress a gzip-compressed patch.
 */
export function decompressPatch(compressed: Buffer): string {
    return zlib.gunzipSync(compressed).toString('utf8');
}

/**
 * Check if two contents are actually different (not just a no-op save).
 */
export function hasActualChanges(oldContent: string, newContent: string): boolean {
    return hashContent(oldContent) !== hashContent(newContent);
}
