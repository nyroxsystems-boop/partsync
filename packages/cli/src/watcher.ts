// ─── PartSync CLI: File Watcher ───────────────────────────────────────────────

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
    DEFAULT_IGNORE_PATTERNS,
    DEBOUNCE_MS,
    AI_BURST_DEBOUNCE_MS,
    FileDiff,
} from '@partsync/shared';
import { createPatch, hashContent, hasActualChanges } from './diffEngine';
import { sendDiff, sendDelete, sendFullFile, getFileVersion, setFileVersion, isApplyingIncoming } from './syncClient';
import { emitEditLock } from './lockClient';
import { recordWrite, getAuthorType, getCurrentDebounce } from './agentDetector';

let watcher: chokidar.FSWatcher | null = null;
const fileContents = new Map<string, string>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
let watcherReady = false;

/**
 * Start watching a project directory for file changes.
 */
export function startWatcher(
    projectDir: string,
    clientName: string,
    extraIgnore: string[] = [],
): chokidar.FSWatcher {
    const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...extraIgnore];

    console.log(chalk.blue(`  👁️  Watching: ${projectDir}`));
    console.log(chalk.gray(`  Ignoring: ${ignorePatterns.length} patterns`));

    watcher = chokidar.watch(projectDir, {
        ignored: ignorePatterns,
        persistent: true,
        ignoreInitial: false,
        followSymlinks: false,
        depth: 20,
        awaitWriteFinish: {
            stabilityThreshold: 100,
            pollInterval: 50,
        },
    });

    // ── File add: cache + send full file if watcher is already running ─────
    watcher.on('add', (filepath) => {
        if (isApplyingIncoming()) return;
        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const relPath = path.relative(projectDir, filepath);
            fileContents.set(relPath, content);
            const hash = hashContent(content);
            setFileVersion(relPath, hash);

            // If watcher is already running (past initial scan), this is a NEW file
            // Send the full file content so other clients can create it
            if (watcherReady) {
                sendFullFile(relPath, content, hash);
                console.log(chalk.cyan(`  📄 ${relPath} → new file synced`));
            }
        } catch {
            // Binary file or read error — skip
        }
    });

    // ── File changed ──────────────────────────────────────────────────────
    watcher.on('change', (filepath) => {
        // Skip if we're applying an incoming diff (prevents loops)
        if (isApplyingIncoming()) return;

        const relPath = path.relative(projectDir, filepath);

        // Record write for agent detection
        recordWrite(relPath);

        // Debounce (adaptive based on burst mode)
        const debounce = getCurrentDebounce(DEBOUNCE_MS, AI_BURST_DEBOUNCE_MS);
        const existingTimer = debounceTimers.get(relPath);
        if (existingTimer) clearTimeout(existingTimer);

        debounceTimers.set(relPath, setTimeout(() => {
            debounceTimers.delete(relPath);
            processFileChange(filepath, relPath, clientName);
        }, debounce));
    });

    // ── File deleted ──────────────────────────────────────────────────────
    watcher.on('unlink', (filepath) => {
        if (isApplyingIncoming()) return;

        const relPath = path.relative(projectDir, filepath);
        fileContents.delete(relPath);
        sendDelete(relPath);
        console.log(chalk.red(`  🗑️  Deleted: ${relPath}`));
    });

    watcher.on('ready', () => {
        watcherReady = true;
        const count = fileContents.size;
        console.log(chalk.green(`  ✅ Initial scan complete: ${count} files tracked`));
    });

    watcher.on('error', (err) => {
        console.log(chalk.red(`  ❌ Watcher error: ${err.message}`));
    });

    return watcher;
}

/**
 * Process a changed file: compute diff and send to server.
 */
function processFileChange(filepath: string, relPath: string, clientName: string): void {
    try {
        const newContent = fs.readFileSync(filepath, 'utf8');
        const oldContent = fileContents.get(relPath) || '';

        // Skip no-op saves
        if (!hasActualChanges(oldContent, newContent)) return;

        const oldHash = hashContent(oldContent);
        const newHash = hashContent(newContent);

        // If no old content exists (file was not previously tracked), send full file
        if (!oldContent || oldContent === '') {
            sendFullFile(relPath, newContent, newHash);
            fileContents.set(relPath, newContent);
            console.log(chalk.cyan(`  📄 ${relPath} → full file synced`));
            return;
        }

        const patch = createPatch(oldContent, newContent);

        // Skip empty patches
        if (!patch || patch.trim() === '') return;

        const diff: FileDiff = {
            file: relPath,
            patch,
            author: clientName,
            type: getAuthorType(),
            timestamp: Date.now(),
            version: newHash,
            previousVersion: oldHash,
        };

        // Emit edit lock
        emitEditLock(relPath, getAuthorType() === 'ai' ? 'ai-writing' : 'editing');

        // Send diff
        sendDiff(diff);

        // Update cache
        fileContents.set(relPath, newContent);

        const typeIcon = diff.type === 'ai' ? '🤖' : '✏️';
        console.log(chalk.cyan(`  ${typeIcon} ${relPath} → synced (${patch.length} bytes)`));
    } catch (err) {
        // Binary file or encoding issue — skip
    }
}

/**
 * Stop the file watcher.
 */
export function stopWatcher(): void {
    if (watcher) {
        watcher.close();
        watcher = null;
        fileContents.clear();
        debounceTimers.clear();
        console.log(chalk.gray('  Watcher stopped'));
    }
}
