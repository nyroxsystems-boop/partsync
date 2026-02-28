// ─── PartSync CLI: Socket.IO Sync Client ─────────────────────────────────────

import { io, Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
    ClientToServerEvents,
    ServerToClientEvents,
    FileDiff,
    SyncHandshake,
    ConflictEvent,
    RECONNECT_DELAY_MS,
    MAX_RECONNECT_ATTEMPTS,
} from '@partsync/shared';
import { applyPatch, hashContent } from './diffEngine';
import { initLockClient } from './lockClient';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;
let projectDir = '';
let clientName = '';
let fileVersions: Record<string, string> = {};

// Guard flag to prevent sync loops
let applyingIncoming = false;
const pendingDiffs: FileDiff[] = [];

export function isApplyingIncoming(): boolean {
    return applyingIncoming;
}

/**
 * Connect to the PartSync server.
 */
export function connect(serverUrl: string, name: string, dir: string): TypedSocket {
    clientName = name;
    projectDir = dir;

    console.log(chalk.blue(`  🔌 Connecting to ${serverUrl}...`));

    socket = io(serverUrl, {
        query: { clientName: name },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: RECONNECT_DELAY_MS,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    }) as TypedSocket;

    socket.on('connect', () => {
        console.log(chalk.green(`  ✅ Connected to PartSync server`));
        performHandshake();
    });

    socket.on('disconnect', (reason) => {
        console.log(chalk.yellow(`  ⚡ Disconnected: ${reason}`));
    });

    socket.on('connect_error', (err) => {
        console.log(chalk.red(`  ❌ Connection error: ${err.message}`));
    });

    // ── Incoming file diffs ──────────────────────────────────────────────
    socket.on('file:diff', (diff: FileDiff) => {
        handleIncomingDiff(diff);
    });

    // ── Incoming file conflicts ──────────────────────────────────────────
    socket.on('file:conflict', (event: ConflictEvent) => {
        console.log(chalk.red(`  ⚠️  CONFLICT on ${event.file}`));
        console.log(chalk.red(`     ${event.authorA} vs ${event.authorB}`));
        console.log(chalk.red(`     Conflict copy: ${event.conflictFile}`));
    });

    // ── Incoming file deletes ────────────────────────────────────────────
    socket.on('file:delete', (data) => {
        const fullPath = path.join(projectDir, data.file);
        applyingIncoming = true;
        try {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                console.log(chalk.gray(`  🗑️  Remote delete: ${data.file} (by ${data.author})`));
            }
        } finally {
            setTimeout(() => { applyingIncoming = false; }, 200);
        }
    });

    // ── Incoming file renames ────────────────────────────────────────────
    socket.on('file:rename', (data) => {
        const oldPath = path.join(projectDir, data.oldFile);
        const newPath = path.join(projectDir, data.newFile);
        applyingIncoming = true;
        try {
            if (fs.existsSync(oldPath)) {
                const dir = path.dirname(newPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.renameSync(oldPath, newPath);
                console.log(chalk.gray(`  📝 Remote rename: ${data.oldFile} → ${data.newFile} (by ${data.author})`));
            }
        } finally {
            setTimeout(() => { applyingIncoming = false; }, 200);
        }
    });

    // ── Full file sync (fallback) ────────────────────────────────────────
    socket.on('sync:apply-full-file', (data) => {
        const fullPath = path.join(projectDir, data.file);
        applyingIncoming = true;
        try {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, data.content, 'utf8');
            fileVersions[data.file] = data.hash;
            console.log(chalk.gray(`  📄 Full file sync: ${data.file}`));
        } finally {
            setTimeout(() => { applyingIncoming = false; }, 200);
        }
    });

    // Initialize lock client
    initLockClient(socket);

    return socket;
}

/**
 * Send a file diff to the server.
 */
export function sendDiff(diff: FileDiff): void {
    if (!socket || !socket.connected) {
        pendingDiffs.push(diff);
        return;
    }
    socket.emit('file:diff', diff);
    fileVersions[diff.file] = diff.version;
}

/**
 * Send a file delete event.
 */
export function sendDelete(file: string): void {
    if (!socket || !socket.connected) return;
    socket.emit('file:delete', { file, author: clientName });
    delete fileVersions[file];
}

/**
 * Send a full file to the server (for new files or when diff fails).
 */
export function sendFullFile(file: string, content: string, hash: string): void {
    if (!socket || !socket.connected) return;
    socket.emit('sync:full-file', { file, content, hash });
    fileVersions[file] = hash;
}

/**
 * Perform sync handshake on (re)connect.
 */
function performHandshake(): void {
    if (!socket) return;

    console.log(chalk.blue(`  🤝 Performing sync handshake...`));

    const handshake: SyncHandshake = {
        clientId: socket.id || '',
        projectId: path.basename(projectDir),
        fileVersions,
    };

    socket.emit('sync:handshake', handshake, (response) => {
        console.log(chalk.blue(`  📥 Received ${response.missingDiffs.length} missing diffs, ${response.fullFiles.length} full files`));

        // Apply missing diffs
        for (const diff of response.missingDiffs) {
            handleIncomingDiff(diff);
        }

        // Apply full files
        for (const file of response.fullFiles) {
            const fullPath = path.join(projectDir, file.file);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, file.content, 'utf8');
            fileVersions[file.file] = hashContent(file.content);
        }

        // Replay pending diffs
        if (pendingDiffs.length > 0) {
            console.log(chalk.blue(`  📤 Replaying ${pendingDiffs.length} queued diffs`));
            const toSend = [...pendingDiffs];
            pendingDiffs.length = 0;
            toSend.forEach(d => sendDiff(d));
        }
    });
}

/**
 * Handle an incoming diff from the server.
 */
function handleIncomingDiff(diff: FileDiff): void {
    const fullPath = path.join(projectDir, diff.file);

    applyingIncoming = true;
    try {
        // Read current file content
        let currentContent = '';
        if (fs.existsSync(fullPath)) {
            currentContent = fs.readFileSync(fullPath, 'utf8');
        }

        // Apply the patch
        const { result, success } = applyPatch(currentContent, diff.patch);

        if (success) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, result, 'utf8');
            fileVersions[diff.file] = diff.version;

            const typeIcon = diff.type === 'ai' ? '🤖' : '👤';
            console.log(chalk.gray(`  ${typeIcon} Synced: ${diff.file} (${diff.author})`));
        } else {
            console.log(chalk.yellow(`  ⚠️  Patch partially applied for ${diff.file}`));
            // Still write the result, as partial application is better than nothing
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, result, 'utf8');
            fileVersions[diff.file] = hashContent(result);
        }
    } catch (err) {
        console.log(chalk.red(`  ❌ Failed to apply diff for ${diff.file}: ${(err as Error).message}`));
    } finally {
        // Keep the flag up for a short while to let FS events settle
        setTimeout(() => { applyingIncoming = false; }, 200);
    }
}

/**
 * Get the current file version hash.
 */
export function getFileVersion(file: string): string | undefined {
    return fileVersions[file];
}

/**
 * Set the file version hash (used by watcher on initial scan).
 */
export function setFileVersion(file: string, hash: string): void {
    fileVersions[file] = hash;
}

/**
 * Disconnect from the server.
 */
export function disconnect(): void {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
