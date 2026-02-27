// ─── Constants & Configuration ───────────────────────────────────────────────

/** Maximum number of diffs to keep per file in history */
export const MAX_DIFF_HISTORY = 100;

/** Debounce interval for file watcher events (ms) */
export const DEBOUNCE_MS = 300;

/** If writes happen faster than this, it's likely an AI agent */
export const AI_BURST_THRESHOLD_MS = 50;

/** Number of rapid writes to confirm AI burst mode */
export const AI_BURST_COUNT = 3;

/** Debounce interval during AI burst mode (ms) */
export const AI_BURST_DEBOUNCE_MS = 100;

/** Delay before reconnecting after disconnect (ms) */
export const RECONNECT_DELAY_MS = 2000;

/** Max reconnection attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 50;

/** Auto-expire stale locks after this duration (ms) – 5 minutes */
export const LOCK_EXPIRY_MS = 5 * 60 * 1000;

/** Batch window for outgoing diffs (ms) */
export const BATCH_WINDOW_MS = 100;

/** Default server port */
export const DEFAULT_PORT = 3777;

/** Default file ignore patterns */
export const DEFAULT_IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/.git/**',
    '**/*.db',
    '**/*.db-journal',
    '**/dist/**',
    '**/.partsync/**',
    '**/.DS_Store',
    '**/package-lock.json',
    '**/yarn.lock',
];

/** Dashboard update interval (ms) */
export const DASHBOARD_UPDATE_INTERVAL_MS = 2000;

/** Project name */
export const PROJECT_NAME = 'PartSync';

/** Version */
export const VERSION = '1.0.0';
