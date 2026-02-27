// ─── PartSync Dashboard: Client-Side App ─────────────────────────────────────
(function () {
    'use strict';

    const socket = io({ transports: ['websocket', 'polling'] });

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const connectionStatus = $('connectionStatus');
    const statusDot = connectionStatus.querySelector('.status-dot');
    const statusText = connectionStatus.querySelector('.status-text');
    const uptime = $('uptime');
    const clientCount = $('clientCount');
    const totalDiffs = $('totalDiffs');
    const totalFiles = $('totalFiles');
    const dbSize = $('dbSize');
    const agentsBadge = $('agentsBadge');
    const agentsList = $('agentsList');
    const locksBadge = $('locksBadge');
    const locksList = $('locksList');
    const feedBadge = $('feedBadge');
    const feedList = $('feedList');
    const conflictsBadge = $('conflictsBadge');
    const conflictsList = $('conflictsList');

    // ── Connection status ────────────────────────────────────────────────────
    socket.on('connect', () => {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected';
        socket.emit('dashboard:subscribe');
    });

    socket.on('disconnect', () => {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Disconnected';
    });

    // ── Dashboard state updates ──────────────────────────────────────────────
    socket.on('dashboard:state', (state) => {
        renderHealth(state.health);
        renderAgents(state.connectedClients);
        renderLocks(state.locks);
        renderFeed(state.recentDiffs);
        renderConflicts(state.conflicts);
    });

    // ── Render functions ─────────────────────────────────────────────────────

    function renderHealth(health) {
        uptime.textContent = formatUptime(health.uptime);
        totalDiffs.textContent = health.totalDiffs.toLocaleString();
        totalFiles.textContent = health.totalFiles.toLocaleString();
        dbSize.textContent = formatBytes(health.dbSizeBytes);
    }

    function renderAgents(clients) {
        // Subtract 1 for the dashboard's own connection
        const syncClients = clients.filter(c => !c.id.includes('dashboard'));
        clientCount.textContent = syncClients.length;
        agentsBadge.textContent = syncClients.length;

        if (syncClients.length === 0) {
            agentsList.innerHTML = '<div class="empty-state">No agents connected</div>';
            return;
        }

        agentsList.innerHTML = syncClients.map(c => `
      <div class="agent-item">
        <div class="agent-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="agent-info">
          <div class="agent-name">${escapeHtml(c.name)}</div>
          <div class="agent-meta">Connected ${timeAgo(c.connectedSince)} · Active ${timeAgo(c.lastActivity)}</div>
        </div>
      </div>
    `).join('');
    }

    function renderLocks(locks) {
        locksBadge.textContent = locks.length;
        if (locks.length === 0) {
            locksList.innerHTML = '<div class="empty-state">No active locks</div>';
            return;
        }

        locksList.innerHTML = locks.map(l => `
      <div class="lock-item">
        <div class="lock-icon ${l.lockType}">
          ${l.lockType === 'ai-writing' ? '🤖' : '✏️'}
        </div>
        <div class="lock-info">
          <div class="lock-file">${escapeHtml(l.file)}</div>
          <div class="lock-meta">by ${escapeHtml(l.lockedBy)} · ${timeAgo(l.since)}</div>
        </div>
        <span class="lock-type-badge ${l.lockType}">
          ${l.lockType === 'ai-writing' ? 'AI Writing' : 'Editing'}
        </span>
      </div>
    `).join('');
    }

    function renderFeed(diffs) {
        feedBadge.textContent = diffs.length;
        if (diffs.length === 0) {
            feedList.innerHTML = '<div class="empty-state">Waiting for changes...</div>';
            return;
        }

        feedList.innerHTML = diffs.slice(0, 30).map(d => `
      <div class="feed-item">
        <div class="feed-dot ${d.type}"></div>
        <div class="feed-content">
          <div class="feed-file">${escapeHtml(d.file)}</div>
          <div class="feed-meta">
            <span>${escapeHtml(d.author)}</span>
            <span>·</span>
            <span>${d.type === 'ai' ? '🤖 AI' : '👤 Human'}</span>
          </div>
        </div>
        <span class="feed-time">${formatTime(d.timestamp)}</span>
      </div>
    `).join('');
    }

    function renderConflicts(conflicts) {
        conflictsBadge.textContent = conflicts.length;
        if (conflicts.length === 0) {
            conflictsList.innerHTML = '<div class="empty-state">No conflicts — all clear! ✅</div>';
            return;
        }

        conflictsList.innerHTML = conflicts.map(c => `
      <div class="conflict-item">
        <span class="conflict-icon">⚠️</span>
        <div class="conflict-info">
          <div class="conflict-file">${escapeHtml(c.file)}</div>
          <div class="conflict-meta">
            ${escapeHtml(c.authorA)} vs ${escapeHtml(c.authorB)} · ${timeAgo(c.timestamp)}
            ${c.resolved ? ' · ✅ Resolved' : ' · 🔴 Unresolved'}
          </div>
        </div>
      </div>
    `).join('');
    }

    // ── Utilities ────────────────────────────────────────────────────────────

    function formatUptime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);
        if (d > 0) return d + 'd ' + (h % 24) + 'h';
        if (h > 0) return h + 'h ' + (m % 60) + 'm';
        if (m > 0) return m + 'm ' + (s % 60) + 's';
        return s + 's';
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function timeAgo(ts) {
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        if (s < 10) return 'just now';
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.floor(h / 24) + 'd ago';
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
})();
