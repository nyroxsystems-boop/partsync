// ─── PartSync Desktop: Renderer App ──────────────────────────────────────────
(function () {
    'use strict';

    const projectList = document.getElementById('projectList');
    const emptyState = document.getElementById('emptyState');
    const addProjectBtn = document.getElementById('addProject');
    const openDashboardBtn = document.getElementById('openDashboard');
    const quitBtn = document.getElementById('quit');

    // ── Event listeners ──────────────────────────────────────────────────
    addProjectBtn.addEventListener('click', () => {
        window.partsync.addProject();
    });

    openDashboardBtn.addEventListener('click', () => {
        window.partsync.openDashboard();
    });

    quitBtn.addEventListener('click', () => {
        window.partsync.quit();
    });

    // ── Status updates ───────────────────────────────────────────────────
    window.partsync.onStatusUpdate((statuses) => {
        renderProjects(statuses);
    });

    // Load initial data
    window.partsync.getConfig().then((config) => {
        if (config.projects.length === 0) {
            showEmpty();
        }
    });

    // ── Render ───────────────────────────────────────────────────────────

    function renderProjects(statuses) {
        if (statuses.length === 0) {
            showEmpty();
            return;
        }

        emptyState.style.display = 'none';

        // Keep only project cards, remove old ones
        const existingCards = projectList.querySelectorAll('.project-card');
        const existingIds = new Set();
        existingCards.forEach(c => existingIds.add(c.dataset.id));

        statuses.forEach(s => {
            let card = projectList.querySelector(`[data-id="${s.id}"]`);
            if (!card) {
                card = createProjectCard(s);
                projectList.appendChild(card);
            } else {
                updateProjectCard(card, s);
            }
        });
    }

    function createProjectCard(s) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.dataset.id = s.id;
        updateProjectCard(card, s);
        return card;
    }

    function updateProjectCard(card, s) {
        const statusClass = s.syncing ? 'syncing' : (s.connected ? 'connected' : 'disconnected');
        const statusText = s.syncing ? 'Syncing...' : (s.connected ? 'Connected' : 'Disconnected');
        const lastSync = s.lastSync > 0 ? timeAgo(s.lastSync) : 'never';

        let locksHtml = '';
        if (s.locks && s.locks.length > 0) {
            locksHtml = '<div class="project-locks">' +
                s.locks.map(l =>
                    `<span class="lock-tag ${l.lockType === 'ai-writing' ? 'ai' : ''}">` +
                    `${l.lockType === 'ai-writing' ? '🤖' : '🔒'} ${l.file}</span>`
                ).join('') +
                '</div>';
        }

        card.innerHTML = `
      <div class="project-header">
        <div class="project-name">
          <span class="status-dot ${statusClass}"></span>
          ${escapeHtml(s.name)}
        </div>
        <span style="font-size:11px;color:var(--text-muted)">${statusText}</span>
      </div>
      <div class="project-meta">
        <span>📁 ${s.trackedFiles} files</span>
        <span>🕐 ${lastSync}</span>
      </div>
      ${locksHtml}
    `;

        if (s.error) {
            card.innerHTML += `<div style="font-size:11px;color:var(--accent-red);margin-top:6px">⚠️ ${escapeHtml(s.error)}</div>`;
        }
    }

    function showEmpty() {
        emptyState.style.display = 'block';
    }

    function timeAgo(ts) {
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        if (s < 10) return 'just now';
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        return Math.floor(m / 60) + 'h ago';
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
})();
