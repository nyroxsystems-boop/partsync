// ─── PartSync Server: Entry Point ────────────────────────────────────────────

import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { DEFAULT_PORT, VERSION, PROJECT_NAME } from '@partsync/shared';
import { initDatabase } from './db';
import { restoreLocksFromDb } from './lockManager';
import { registerSocketHandlers } from './socketHandlers';

const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
(global as any).__partSyncStartTime = Date.now();

// ── Express App ──────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// ── Socket.IO ────────────────────────────────────────────────────────────────

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 5e6, // 5MB max payload
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// Serve dashboard static files
app.use(express.static(path.join(__dirname, 'dashboard')));

// ── API Routes ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
    const uptime = Date.now() - (global as any).__partSyncStartTime;
    res.json({
        status: 'ok',
        name: PROJECT_NAME,
        version: VERSION,
        uptime,
        uptimeHuman: formatUptime(uptime),
    });
});

app.get('/api/status', (_req, res) => {
    res.json({
        status: 'running',
        version: VERSION,
        port: PORT,
    });
});

// Dashboard SPA fallback
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// ── Initialize & Start ──────────────────────────────────────────────────────

function start(): void {
    console.log(`
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║   ⚡ ${PROJECT_NAME} Server v${VERSION}              ║
  ║   Real-time sync for agent-first teams    ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
  `);

    // Initialize database
    initDatabase();

    // Restore locks from previous session
    restoreLocksFromDb();

    // Register WebSocket handlers
    registerSocketHandlers(io as any);

    // Start HTTP server
    server.listen(PORT, () => {
        console.log(`[Server] Listening on port ${PORT}`);
        console.log(`[Server] Dashboard: http://localhost:${PORT}`);
        console.log(`[Server] Health: http://localhost:${PORT}/health`);
    });
}

function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

start();
