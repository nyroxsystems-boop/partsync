// ─── PartSync Server: Lock Manager ───────────────────────────────────────────

import { LockState, LockType, LOCK_EXPIRY_MS } from '@partsync/shared';
import * as db from './db';

interface LockEntry extends LockState {
    socketId?: string;
}

const inMemoryLocks = new Map<string, LockEntry>();

export function acquireLock(
    file: string,
    lockedBy: string,
    lockType: LockType,
    socketId?: string,
): { success: boolean; existingLock?: LockState } {
    const existing = inMemoryLocks.get(file);

    // If already locked by the same user, just update type
    if (existing && existing.lockedBy === lockedBy) {
        existing.lockType = lockType;
        existing.since = Date.now();
        existing.socketId = socketId;
        db.upsertLock({ file, lockedBy, lockType, since: existing.since });
        return { success: true };
    }

    // If locked by someone else, check for expiry
    if (existing) {
        const age = Date.now() - existing.since;
        if (age < LOCK_EXPIRY_MS) {
            return { success: false, existingLock: existing };
        }
        // Expired — allow takeover
        console.log(`[LockManager] Lock on ${file} by ${existing.lockedBy} expired, allowing takeover`);
    }

    const lock: LockEntry = { file, lockedBy, lockType, since: Date.now(), socketId };
    inMemoryLocks.set(file, lock);
    db.upsertLock({ file, lockedBy, lockType, since: lock.since });
    return { success: true };
}

export function releaseLock(file: string, lockedBy?: string): boolean {
    const existing = inMemoryLocks.get(file);
    if (!existing) return false;
    if (lockedBy && existing.lockedBy !== lockedBy) return false;

    inMemoryLocks.delete(file);
    db.removeLock(file);
    return true;
}

export function releaseAllLocksForClient(clientName: string, socketId?: string): string[] {
    const released: string[] = [];
    for (const [file, lock] of inMemoryLocks.entries()) {
        if (lock.lockedBy === clientName || (socketId && lock.socketId === socketId)) {
            inMemoryLocks.delete(file);
            released.push(file);
        }
    }
    if (released.length > 0) {
        db.removeLocksForClient(clientName);
    }
    return released;
}

export function getLock(file: string): LockState | undefined {
    return inMemoryLocks.get(file);
}

export function getAllLocks(): LockState[] {
    return Array.from(inMemoryLocks.values()).map(({ socketId, ...lock }) => lock);
}

export function cleanExpiredLocks(): string[] {
    const now = Date.now();
    const expired: string[] = [];
    for (const [file, lock] of inMemoryLocks.entries()) {
        if (now - lock.since >= LOCK_EXPIRY_MS) {
            inMemoryLocks.delete(file);
            db.removeLock(file);
            expired.push(file);
        }
    }
    return expired;
}

/** Restore locks from SQLite on server startup */
export function restoreLocksFromDb(): void {
    const dbLocks = db.getAllLocks();
    const now = Date.now();
    for (const lock of dbLocks) {
        // Only restore non-expired locks
        if (now - lock.since < LOCK_EXPIRY_MS) {
            inMemoryLocks.set(lock.file, lock);
        } else {
            db.removeLock(lock.file);
        }
    }
    console.log(`[LockManager] Restored ${inMemoryLocks.size} locks from DB`);
}
