// ─── PartSync Server: Socket.IO Event Handlers ──────────────────────────────

import { Server, Socket } from 'socket.io';
import {
    ClientToServerEvents,
    ServerToClientEvents,
    FileDiff,
    LockState,
    DashboardState,
    SyncHandshake,
    SyncHandshakeResponse,
    PeerInfo,
    EcosystemProject,
    EcosystemOwnerState,
    EcosystemMergedState,
    DASHBOARD_UPDATE_INTERVAL_MS,
} from '@partsync/shared';
import * as lockManager from './lockManager';
import * as diffStore from './diffStore';
import * as conflictResolver from './conflictResolver';
import * as db from './db';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface ClientInfo {
    id: string;
    name: string;
    connectedSince: number;
    lastActivity: number;
}

const connectedClients = new Map<string, ClientInfo>();
const dashboardSockets = new Set<string>();
let dashboardInterval: NodeJS.Timeout | undefined;

// ── Ecosystem Dashboard Sync State ──
const ecosystemState = new Map<string, EcosystemOwnerState>();
const ecosystemDashboards = new Set<string>();

function getEcosystemMergedState(): EcosystemMergedState {
    // Merge all owners' projects, dedup by project.id (newest lastActivity wins)
    const projectMap = new Map<string, EcosystemProject>();
    const owners: EcosystemMergedState['owners'] = [];

    for (const [ownerName, ownerState] of ecosystemState) {
        owners.push({
            name: ownerName,
            color: ownerState.ownerColor,
            projectCount: ownerState.projects.length,
            online: (Date.now() - ownerState.lastSeen) < 120_000, // 2min timeout
        });

        for (const project of ownerState.projects) {
            const existing = projectMap.get(project.id);
            if (!existing) {
                projectMap.set(project.id, project);
            } else {
                // Dedup: keep the one with the newest lastActivity
                const existDate = new Date(existing.lastActivity).getTime();
                const newDate = new Date(project.lastActivity).getTime();
                if (newDate > existDate) {
                    projectMap.set(project.id, project);
                }
            }
        }
    }

    return {
        owners,
        projects: Array.from(projectMap.values()),
        totalOwners: owners.length,
    };
}

export function registerSocketHandlers(io: TypedServer): void {
    // Start dashboard broadcast loop
    startDashboardBroadcast(io);

    // Clean expired locks periodically
    setInterval(() => {
        const expired = lockManager.cleanExpiredLocks();
        if (expired.length > 0) {
            console.log(`[Locks] Cleaned ${expired.length} expired locks`);
            broadcastLocks(io);
        }
    }, 30_000);

    io.on('connection', (socket: TypedSocket) => {
        const clientName = (socket.handshake.query.clientName as string) || `client-${socket.id.slice(0, 6)}`;

        console.log(`[WS] Client connected: ${clientName} (${socket.id})`);

        connectedClients.set(socket.id, {
            id: socket.id,
            name: clientName,
            connectedSince: Date.now(),
            lastActivity: Date.now(),
        });

        // Broadcast updated peers list to all clients
        broadcastPeers(io);

        // ── File Diff ──────────────────────────────────────────────────────
        socket.on('file:diff', (diff: FileDiff) => {
            updateActivity(socket.id);

            // Check for version conflict
            const currentVersion = diffStore.getFileVersion(diff.file);
            if (currentVersion && currentVersion.hash !== diff.previousVersion) {
                // Version mismatch — potential conflict
                const recentDiffs = diffStore.getDiffsForFile(diff.file);
                const lastDiff = recentDiffs[recentDiffs.length - 1];

                if (lastDiff) {
                    const result = conflictResolver.resolveConflict(lastDiff, diff);
                    if (!result.merged && result.conflictEvent) {
                        // Notify all clients about the conflict
                        io.emit('file:conflict', result.conflictEvent);
                        console.log(`[WS] Conflict emitted for ${diff.file}`);
                    }
                }
            }

            // Store the diff regardless (we keep both versions)
            const diffId = diffStore.storeDiff(diff);

            // Broadcast to all other clients
            socket.broadcast.emit('file:diff', { ...diff, id: diffId });
        });

        // ── File Lock ─────────────────────────────────────────────────────
        socket.on('file:lock', ({ file, lockType }) => {
            updateActivity(socket.id);
            const result = lockManager.acquireLock(file, clientName, lockType, socket.id);

            if (result.success) {
                console.log(`[WS] Lock acquired: ${file} by ${clientName} (${lockType})`);
            } else {
                console.log(`[WS] Lock denied: ${file} — already locked by ${result.existingLock?.lockedBy}`);
            }

            broadcastLocks(io);
        });

        socket.on('file:unlock', ({ file }) => {
            updateActivity(socket.id);
            lockManager.releaseLock(file, clientName);
            console.log(`[WS] Lock released: ${file} by ${clientName}`);
            broadcastLocks(io);
        });

        // ── File Delete / Rename ──────────────────────────────────────────
        socket.on('file:delete', (data) => {
            updateActivity(socket.id);
            lockManager.releaseLock(data.file);
            socket.broadcast.emit('file:delete', data);
            console.log(`[WS] File deleted: ${data.file} by ${data.author}`);
        });

        socket.on('file:rename', (data) => {
            updateActivity(socket.id);
            lockManager.releaseLock(data.oldFile);
            socket.broadcast.emit('file:rename', data);
            console.log(`[WS] File renamed: ${data.oldFile} → ${data.newFile} by ${data.author}`);
        });

        // ── Sync Handshake (Reconnection) ─────────────────────────────────
        socket.on('sync:handshake', (data: SyncHandshake, callback) => {
            updateActivity(socket.id);
            console.log(`[WS] Handshake from ${clientName} with ${Object.keys(data.fileVersions).length} known files`);

            const serverVersions = diffStore.getAllFileVersions();
            const missingDiffs: FileDiff[] = [];
            const fullFiles: Array<{ file: string; content: string }> = [];

            for (const [file, serverHash] of Object.entries(serverVersions)) {
                const clientHash = data.fileVersions[file];
                if (clientHash !== serverHash) {
                    // Client is behind — send missing diffs
                    const diffs = clientHash
                        ? diffStore.getDiffsForFile(file, clientHash)
                        : diffStore.getDiffsForFile(file);
                    missingDiffs.push(...diffs);
                }
            }

            const response: SyncHandshakeResponse = {
                missingDiffs,
                fullFiles,
                locks: lockManager.getAllLocks(),
            };

            callback(response);
        });

        // ── Full File Upload (Fallback) ───────────────────────────────────
        socket.on('sync:full-file', (data) => {
            updateActivity(socket.id);
            db.upsertFileVersion({ file: data.file, hash: data.hash, timestamp: Date.now() });
            socket.broadcast.emit('sync:apply-full-file', data);
            console.log(`[WS] Full file sync: ${data.file}`);
        });

        // ── Dashboard Subscribe ───────────────────────────────────────────
        socket.on('dashboard:subscribe', () => {
            dashboardSockets.add(socket.id);
            console.log(`[WS] Dashboard client subscribed: ${socket.id}`);
            // Immediately send current state
            emitDashboardState(io, socket);
        });

        // ── Diff Undo ─────────────────────────────────────────────────────
        socket.on('diff:undo', ({ file, diffId }) => {
            updateActivity(socket.id);
            const diff = diffStore.getDiffById(diffId);
            if (diff) {
                // Create a "reverse diff" and broadcast it
                const undoDiff: FileDiff = {
                    file: diff.file,
                    patch: diff.patch, // Client will reverse-apply
                    author: clientName,
                    type: 'human',
                    timestamp: Date.now(),
                    version: diff.previousVersion,
                    previousVersion: diff.version,
                };
                io.emit('file:diff', undoDiff);
                console.log(`[WS] Undo diff #${diffId} on ${file}`);
            }
        });

        // ── Conflict Resolution ──────────────────────────────────────────
        socket.on('conflict:resolve', (data) => {
            updateActivity(socket.id);
            console.log(`[WS] Conflict resolved on ${data.file}: ${data.resolution} by ${clientName}`);
            // In a real implementation, we'd apply the chosen version
            // For now, just log and broadcast the resolution
        });

        // ── Ecosystem Dashboard Sync ─────────────────────────────────────
        socket.on('ecosystem:push', (data) => {
            console.log(`[Ecosystem] Push from ${data.owner}: ${data.projects.length} projects`);
            ecosystemState.set(data.owner, {
                owner: data.owner,
                ownerColor: data.ownerColor,
                projects: data.projects,
                lastSeen: Date.now(),
                socketId: socket.id,
            });
            // Broadcast merged state to ALL connected ecosystem dashboards
            const merged = getEcosystemMergedState();
            for (const sid of ecosystemDashboards) {
                if (sid !== socket.id) {
                    io.to(sid).emit('ecosystem:state', merged);
                }
            }
        });

        socket.on('ecosystem:subscribe', () => {
            ecosystemDashboards.add(socket.id);
            console.log(`[Ecosystem] Dashboard subscribed: ${socket.id}`);
            // Send current merged state immediately
            socket.emit('ecosystem:state', getEcosystemMergedState());
        });

        // ── Disconnect ────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[WS] Client disconnected: ${clientName} (${socket.id})`);
            connectedClients.delete(socket.id);
            dashboardSockets.delete(socket.id);
            ecosystemDashboards.delete(socket.id);
            const released = lockManager.releaseAllLocksForClient(clientName, socket.id);
            if (released.length > 0) {
                console.log(`[WS] Released ${released.length} locks for ${clientName}`);
                broadcastLocks(io);
            }
            // Broadcast updated peers list
            broadcastPeers(io);
        });
    });
}

function updateActivity(socketId: string): void {
    const client = connectedClients.get(socketId);
    if (client) client.lastActivity = Date.now();
}

function broadcastLocks(io: TypedServer): void {
    const locks = lockManager.getAllLocks();
    io.emit('file:lock-changed', locks);
}

function broadcastPeers(io: TypedServer): void {
    const peers: PeerInfo[] = Array.from(connectedClients.values()).map(c => ({
        id: c.id,
        name: c.name,
        connectedSince: c.connectedSince,
        lastActivity: c.lastActivity,
    }));
    io.emit('peers:update', peers);
}

function emitDashboardState(io: TypedServer, socket?: TypedSocket): void {
    const startTime = (global as any).__partSyncStartTime || Date.now();
    const state: DashboardState = {
        connectedClients: Array.from(connectedClients.values()),
        locks: lockManager.getAllLocks(),
        recentDiffs: diffStore.getRecentDiffs(30),
        conflicts: conflictResolver.getRecentConflicts(10),
        health: {
            uptime: Date.now() - startTime,
            dbSizeBytes: db.getDbSizeBytes(),
            totalDiffs: db.getTotalDiffCount(),
            totalFiles: db.getTrackedFileCount(),
        },
    };

    if (socket) {
        socket.emit('dashboard:state', state);
    } else {
        for (const sid of dashboardSockets) {
            io.to(sid).emit('dashboard:state', state);
        }
    }
}

function startDashboardBroadcast(io: TypedServer): void {
    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(() => {
        if (dashboardSockets.size > 0) {
            emitDashboardState(io);
        }
    }, DASHBOARD_UPDATE_INTERVAL_MS);
}
