// ─── PartSync Desktop: Project Manager ───────────────────────────────────────
// Orchestrates multiple project watchers and sync clients

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { io, Socket } from 'socket.io-client';
import DiffMatchPatch from 'diff-match-patch';
import {
    DEFAULT_IGNORE_PATTERNS,
    DEBOUNCE_MS,
    AI_BURST_THRESHOLD_MS,
    AI_BURST_DEBOUNCE_MS,
    AI_BURST_COUNT,
    RECONNECT_DELAY_MS,
    MAX_RECONNECT_ATTEMPTS,
    FileDiff,
    LockState,
    ClientToServerEvents,
    ServerToClientEvents,
    SyncHandshake,
} from '@partsync/shared';
import { ProjectConfig, getClientName } from './store';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const dmp = new DiffMatchPatch();

// ─── Per-Project Sync Instance ───────────────────────────────────────────────

export interface ProjectStatus {
    id: string;
    name: string;
    localPath: string;
    connected: boolean;
    syncing: boolean;
    trackedFiles: number;
    lastSync: number;
    locks: LockState[];
    error?: string;
}

interface ProjectInstance {
    config: ProjectConfig;
    watcher: chokidar.FSWatcher | null;
    socket: TypedSocket | null;
    fileContents: Map<string, string>;
    fileVersions: Record<string, string>;
    debounceTimers: Map<string, NodeJS.Timeout>;
    applyingIncoming: boolean;
    burstMode: boolean;
    lastWrites: number[];
    status: ProjectStatus;
}

const activeProjects = new Map<string, ProjectInstance>();
let statusCallback: ((statuses: ProjectStatus[]) => void) | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function onStatusChange(cb: (statuses: ProjectStatus[]) => void): void {
    statusCallback = cb;
}

export function startProject(config: ProjectConfig): void {
    if (activeProjects.has(config.id)) {
        stopProject(config.id);
    }

    const instance: ProjectInstance = {
        config,
        watcher: null,
        socket: null,
        fileContents: new Map(),
        fileVersions: {},
        debounceTimers: new Map(),
        applyingIncoming: false,
        burstMode: false,
        lastWrites: [],
        status: {
            id: config.id,
            name: config.name,
            localPath: config.localPath,
            connected: false,
            syncing: false,
            trackedFiles: 0,
            lastSync: 0,
            locks: [],
        },
    };

    activeProjects.set(config.id, instance);

    // Connect to server
    connectProject(instance);

    // Start file watcher
    startWatcher(instance);

    emitStatuses();
}

export function stopProject(id: string): void {
    const instance = activeProjects.get(id);
    if (!instance) return;

    if (instance.watcher) {
        instance.watcher.close();
        instance.watcher = null;
    }
    if (instance.socket) {
        instance.socket.disconnect();
        instance.socket = null;
    }
    instance.debounceTimers.forEach(t => clearTimeout(t));
    instance.debounceTimers.clear();

    activeProjects.delete(id);
    emitStatuses();
}

export function stopAll(): void {
    for (const id of activeProjects.keys()) {
        stopProject(id);
    }
}

export function getStatuses(): ProjectStatus[] {
    return Array.from(activeProjects.values()).map(i => ({ ...i.status }));
}

// ─── Socket Connection ──────────────────────────────────────────────────────

function connectProject(instance: ProjectInstance): void {
    const { config } = instance;
    const clientName = getClientName();

    instance.socket = io(config.serverUrl, {
        query: {
            clientName,
            projectId: config.id,
            token: config.token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: RECONNECT_DELAY_MS,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    }) as TypedSocket;

    instance.socket.on('connect', () => {
        instance.status.connected = true;
        instance.status.error = undefined;
        emitStatuses();

        // Perform handshake
        const handshake: SyncHandshake = {
            clientId: instance.socket?.id || '',
            projectId: config.id,
            fileVersions: instance.fileVersions,
        };
        instance.socket?.emit('sync:handshake', handshake, (response) => {
            for (const diff of response.missingDiffs) {
                applyIncomingDiff(instance, diff);
            }
            for (const file of response.fullFiles) {
                applyFullFile(instance, file.file, file.content);
            }
            instance.status.locks = response.locks;
            emitStatuses();
        });
    });

    instance.socket.on('disconnect', () => {
        instance.status.connected = false;
        emitStatuses();
    });

    instance.socket.on('connect_error', (err) => {
        instance.status.error = err.message;
        instance.status.connected = false;
        emitStatuses();
    });

    instance.socket.on('file:diff', (diff: FileDiff) => {
        applyIncomingDiff(instance, diff);
    });

    instance.socket.on('file:lock-changed', (locks: LockState[]) => {
        instance.status.locks = locks;
        emitStatuses();
    });

    instance.socket.on('file:conflict', (event) => {
        // Emit notification to renderer
        if (statusCallback) {
            instance.status.error = `Conflict on ${event.file}`;
            emitStatuses();
        }
    });

    instance.socket.on('file:delete', (data) => {
        const fullPath = path.join(config.localPath, data.file);
        instance.applyingIncoming = true;
        try {
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            instance.fileContents.delete(data.file);
            delete instance.fileVersions[data.file];
        } finally {
            setTimeout(() => { instance.applyingIncoming = false; }, 200);
        }
    });

    instance.socket.on('file:rename', (data) => {
        const oldPath = path.join(config.localPath, data.oldFile);
        const newPath = path.join(config.localPath, data.newFile);
        instance.applyingIncoming = true;
        try {
            if (fs.existsSync(oldPath)) {
                const dir = path.dirname(newPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.renameSync(oldPath, newPath);
            }
        } finally {
            setTimeout(() => { instance.applyingIncoming = false; }, 200);
        }
    });

    instance.socket.on('sync:apply-full-file', (data) => {
        applyFullFile(instance, data.file, data.content);
    });
}

// ─── File Watcher ────────────────────────────────────────────────────────────

function startWatcher(instance: ProjectInstance): void {
    const { config } = instance;
    const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...config.ignorePatterns];

    instance.watcher = chokidar.watch(config.localPath, {
        ignored: ignorePatterns,
        persistent: true,
        ignoreInitial: false,
        followSymlinks: false,
        depth: 20,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    instance.watcher.on('add', (filepath) => {
        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const relPath = path.relative(config.localPath, filepath);
            instance.fileContents.set(relPath, content);
            instance.fileVersions[relPath] = hashContent(content);
            instance.status.trackedFiles = instance.fileContents.size;
        } catch { /* binary or read error */ }
    });

    instance.watcher.on('change', (filepath) => {
        if (instance.applyingIncoming) return;
        const relPath = path.relative(config.localPath, filepath);

        // Agent detection
        const now = Date.now();
        instance.lastWrites.push(now);
        if (instance.lastWrites.length > 20) instance.lastWrites.shift();
        const recent = instance.lastWrites.slice(-AI_BURST_COUNT);
        if (recent.length >= AI_BURST_COUNT) {
            const diffs = [];
            for (let i = 1; i < recent.length; i++) diffs.push(recent[i] - recent[i - 1]);
            instance.burstMode = diffs.every(d => d < AI_BURST_THRESHOLD_MS);
        }

        const debounceMs = instance.burstMode ? AI_BURST_DEBOUNCE_MS : DEBOUNCE_MS;
        const existing = instance.debounceTimers.get(relPath);
        if (existing) clearTimeout(existing);

        instance.debounceTimers.set(relPath, setTimeout(() => {
            instance.debounceTimers.delete(relPath);
            processChange(instance, filepath, relPath);
        }, debounceMs));
    });

    instance.watcher.on('unlink', (filepath) => {
        if (instance.applyingIncoming) return;
        const relPath = path.relative(config.localPath, filepath);
        instance.fileContents.delete(relPath);
        delete instance.fileVersions[relPath];
        instance.socket?.emit('file:delete', { file: relPath, author: getClientName() });
        instance.status.trackedFiles = instance.fileContents.size;
        emitStatuses();
    });

    instance.watcher.on('ready', () => {
        instance.status.trackedFiles = instance.fileContents.size;
        emitStatuses();
    });
}

// ─── Diff Processing ─────────────────────────────────────────────────────────

function processChange(instance: ProjectInstance, filepath: string, relPath: string): void {
    try {
        const newContent = fs.readFileSync(filepath, 'utf8');
        const oldContent = instance.fileContents.get(relPath) || '';

        const oldHash = hashContent(oldContent);
        const newHash = hashContent(newContent);
        if (oldHash === newHash) return;

        const diffs = dmp.diff_main(oldContent, newContent);
        dmp.diff_cleanupSemantic(diffs);
        const patches = dmp.patch_make(oldContent, diffs);
        const patchText = dmp.patch_toText(patches);
        if (!patchText || patchText.trim() === '') return;

        const diff: FileDiff = {
            file: relPath,
            patch: patchText,
            author: getClientName(),
            type: instance.burstMode ? 'ai' : 'human',
            timestamp: Date.now(),
            version: newHash,
            previousVersion: oldHash,
        };

        instance.socket?.emit('file:diff', diff);
        instance.socket?.emit('file:lock', {
            file: relPath,
            lockType: instance.burstMode ? 'ai-writing' : 'editing',
        });

        instance.fileContents.set(relPath, newContent);
        instance.fileVersions[relPath] = newHash;
        instance.status.lastSync = Date.now();
        instance.status.syncing = true;
        emitStatuses();

        setTimeout(() => {
            instance.status.syncing = false;
            emitStatuses();
        }, 500);
    } catch { /* binary or encoding issue */ }
}

function applyIncomingDiff(instance: ProjectInstance, diff: FileDiff): void {
    const fullPath = path.join(instance.config.localPath, diff.file);
    instance.applyingIncoming = true;
    try {
        let currentContent = '';
        if (fs.existsSync(fullPath)) {
            currentContent = fs.readFileSync(fullPath, 'utf8');
        }
        const patches = dmp.patch_fromText(diff.patch);
        const [result] = dmp.patch_apply(patches, currentContent);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, result as string, 'utf8');
        instance.fileContents.set(diff.file, result as string);
        instance.fileVersions[diff.file] = diff.version;
        instance.status.lastSync = Date.now();
        emitStatuses();
    } catch { /* patch failed */ }
    finally {
        setTimeout(() => { instance.applyingIncoming = false; }, 200);
    }
}

function applyFullFile(instance: ProjectInstance, file: string, content: string): void {
    const fullPath = path.join(instance.config.localPath, file);
    instance.applyingIncoming = true;
    try {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        instance.fileContents.set(file, content);
        instance.fileVersions[file] = hashContent(content);
    } finally {
        setTimeout(() => { instance.applyingIncoming = false; }, 200);
    }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

function emitStatuses(): void {
    if (statusCallback) {
        statusCallback(getStatuses());
    }
}
