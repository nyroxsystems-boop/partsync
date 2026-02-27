// ─── Shared Types for PartSync ───────────────────────────────────────────────

export type DiffAuthorType = 'human' | 'ai';

export type LockType = 'editing' | 'ai-writing';

export interface FileDiff {
    id?: number;
    file: string;
    patch: string;
    author: string;
    type: DiffAuthorType;
    timestamp: number;
    version: string;           // SHA-256 hash of file after patch
    previousVersion: string;   // SHA-256 hash of file before patch
    compressed?: boolean;
}

export interface LockState {
    file: string;
    lockedBy: string;
    lockType: LockType;
    since: number;
}

export interface FileVersion {
    file: string;
    hash: string;
    timestamp: number;
}

export interface SyncHandshake {
    clientId: string;
    projectId: string;
    fileVersions: Record<string, string>; // file → hash
}

export interface SyncHandshakeResponse {
    missingDiffs: FileDiff[];
    fullFiles: Array<{ file: string; content: string }>;
    locks: LockState[];
}

export interface ConflictEvent {
    id?: number;
    file: string;
    conflictFile: string;
    authorA: string;
    authorB: string;
    timestamp: number;
    resolved: boolean;
}

export interface DashboardState {
    connectedClients: Array<{
        id: string;
        name: string;
        connectedSince: number;
        lastActivity: number;
    }>;
    locks: LockState[];
    recentDiffs: FileDiff[];
    conflicts: ConflictEvent[];
    health: {
        uptime: number;
        dbSizeBytes: number;
        totalDiffs: number;
        totalFiles: number;
    };
}

// ─── Socket.IO Event Maps ───────────────────────────────────────────────────

export interface ClientToServerEvents {
    'file:diff': (diff: FileDiff) => void;
    'file:lock': (data: { file: string; lockType: LockType }) => void;
    'file:unlock': (data: { file: string }) => void;
    'file:delete': (data: { file: string; author: string }) => void;
    'file:rename': (data: { oldFile: string; newFile: string; author: string }) => void;
    'sync:handshake': (data: SyncHandshake, cb: (res: SyncHandshakeResponse) => void) => void;
    'sync:full-file': (data: { file: string; content: string; hash: string }) => void;
    'dashboard:subscribe': () => void;
    'diff:undo': (data: { file: string; diffId: number }) => void;
}

export interface ServerToClientEvents {
    'file:diff': (diff: FileDiff) => void;
    'file:lock-changed': (locks: LockState[]) => void;
    'file:conflict': (event: ConflictEvent) => void;
    'file:delete': (data: { file: string; author: string }) => void;
    'file:rename': (data: { oldFile: string; newFile: string; author: string }) => void;
    'dashboard:state': (state: DashboardState) => void;
    'sync:apply-full-file': (data: { file: string; content: string; hash: string }) => void;
}
