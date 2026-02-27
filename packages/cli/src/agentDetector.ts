// ─── PartSync CLI: Agent (AI) Write Burst Detector ───────────────────────────

import { AI_BURST_THRESHOLD_MS, AI_BURST_COUNT, DiffAuthorType } from '@partsync/shared';

interface WriteEvent {
    file: string;
    timestamp: number;
}

const recentWrites: WriteEvent[] = [];
let burstMode = false;
let burstTimeout: NodeJS.Timeout | undefined;

/**
 * Record a file write event and determine if we're in an AI burst.
 * AI write bursts are characterized by many rapid-fire writes (< 50ms apart).
 */
export function recordWrite(file: string): void {
    const now = Date.now();
    recentWrites.push({ file, timestamp: now });

    // Keep only last 20 events
    while (recentWrites.length > 20) recentWrites.shift();

    // Check for burst pattern: N rapid consecutive writes
    const recent = recentWrites.slice(-AI_BURST_COUNT);
    if (recent.length >= AI_BURST_COUNT) {
        const timeDiffs: number[] = [];
        for (let i = 1; i < recent.length; i++) {
            timeDiffs.push(recent[i].timestamp - recent[i - 1].timestamp);
        }
        const allRapid = timeDiffs.every(d => d < AI_BURST_THRESHOLD_MS);
        if (allRapid && !burstMode) {
            burstMode = true;
            console.log('🤖 AI write burst detected — prioritizing sync');
        }
    }

    // Auto-exit burst mode after 2 seconds of no rapid writes
    if (burstTimeout) clearTimeout(burstTimeout);
    burstTimeout = setTimeout(() => {
        if (burstMode) {
            burstMode = false;
            console.log('👤 AI burst ended — returning to normal sync');
        }
    }, 2000);
}

/**
 * Check if we're currently in an AI write burst.
 */
export function isInBurstMode(): boolean {
    return burstMode;
}

/**
 * Determine the author type based on current burst state.
 */
export function getAuthorType(): DiffAuthorType {
    return burstMode ? 'ai' : 'human';
}

/**
 * Get the current debounce delay (shorter during AI bursts).
 */
export function getCurrentDebounce(normalDebounce: number, burstDebounce: number): number {
    return burstMode ? burstDebounce : normalDebounce;
}
