// ─── PartSync CLI: Lock Client ────────────────────────────────────────────────

import { Socket } from 'socket.io-client';
import { LockState, LockType, ClientToServerEvents, ServerToClientEvents } from '@partsync/shared';
import chalk from 'chalk';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let currentLocks: LockState[] = [];
let socket: TypedSocket | null = null;
const autoLockTimers = new Map<string, NodeJS.Timeout>();
const AUTO_LOCK_RELEASE_MS = 30_000; // Release lock after 30s idle

export function initLockClient(sock: TypedSocket): void {
    socket = sock;

    socket.on('file:lock-changed', (locks: LockState[]) => {
        currentLocks = locks;
    });
}

/**
 * Emit an editing lock when a file is modified locally.
 * Auto-releases after idle timeout.
 */
export function emitEditLock(file: string, lockType: LockType = 'editing'): void {
    if (!socket) return;

    // Check if already locked by someone else
    const existing = currentLocks.find(l => l.file === file);
    if (existing) {
        console.log(chalk.yellow(`  ⚠ ${file} is locked by ${existing.lockedBy} (${existing.lockType})`));
    }

    socket.emit('file:lock', { file, lockType });

    // Reset auto-release timer
    const existing_timer = autoLockTimers.get(file);
    if (existing_timer) clearTimeout(existing_timer);

    autoLockTimers.set(file, setTimeout(() => {
        releaseLock(file);
        autoLockTimers.delete(file);
    }, AUTO_LOCK_RELEASE_MS));
}

/**
 * Release a lock on a file.
 */
export function releaseLock(file: string): void {
    if (!socket) return;
    socket.emit('file:unlock', { file });
    const timer = autoLockTimers.get(file);
    if (timer) {
        clearTimeout(timer);
        autoLockTimers.delete(file);
    }
}

/**
 * Check if a file is locked by another user.
 */
export function isLockedByOther(file: string, myName: string): LockState | undefined {
    return currentLocks.find(l => l.file === file && l.lockedBy !== myName);
}

/**
 * Get all current locks.
 */
export function getAllLocks(): LockState[] {
    return currentLocks;
}
