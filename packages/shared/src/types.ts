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
    fullContent?: string;      // Full file content for fallback reconstruction
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

export interface PeerInfo {
    id: string;
    name: string;
    connectedSince: number;
    lastActivity: number;
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

// ─── Ecosystem Dashboard Sync Types ─────────────────────────────────────────

export interface EcosystemProject {
    id: string;
    name: string;
    icon: string;
    color: string;
    category: string;
    status: string;
    statusLabel: string;
    description: string;
    longDescription: string;
    tech: string[];
    deployUrl: string | null;
    githubUrl: string | null;
    platform: string;
    region: string;
    localPath: string | null;
    phases: { completed: number; total: number };
    features: string[];
    lastActivity: string;
    lastCommit: string | null;
    linesOfCode: number;
    tests: number;
    healthEndpoint: string | null;
    healthStatus: any;
    _owner: string;
    _ownerColor: string;
}

export interface EcosystemOwnerState {
    owner: string;
    ownerColor: string;
    projects: EcosystemProject[];
    lastSeen: number;
    socketId: string;
}

export interface EcosystemMergedState {
    owners: Array<{ name: string; color: string; projectCount: number; online: boolean }>;
    projects: EcosystemProject[];
    totalOwners: number;
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
    'conflict:resolve': (data: { file: string; resolution: 'accept-mine' | 'accept-theirs' }) => void;
    'ecosystem:push': (data: { owner: string; ownerColor: string; projects: EcosystemProject[] }) => void;
    'ecosystem:subscribe': () => void;
}

export interface ServerToClientEvents {
    'file:diff': (diff: FileDiff) => void;
    'file:lock-changed': (locks: LockState[]) => void;
    'file:conflict': (event: ConflictEvent) => void;
    'file:delete': (data: { file: string; author: string }) => void;
    'file:rename': (data: { oldFile: string; newFile: string; author: string }) => void;
    'dashboard:state': (state: DashboardState) => void;
    'sync:apply-full-file': (data: { file: string; content: string; hash: string }) => void;
    'peers:update': (peers: PeerInfo[]) => void;
    'ecosystem:state': (state: EcosystemMergedState) => void;
}
