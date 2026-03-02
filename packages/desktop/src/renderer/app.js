// ─── PartSync Desktop: Renderer App ──────────────────────────────────────────
(function () {
    'use strict';

    // ── DOM Elements ─────────────────────────────────────────────────────
    const viewList = document.getElementById('viewList');
    const viewAddProject = document.getElementById('viewAddProject');
    const viewEditName = document.getElementById('viewEditName');

    const projectList = document.getElementById('projectList');
    const emptyState = document.getElementById('emptyState');
    const actionBar = document.getElementById('actionBar');
    const clientNameDisplay = document.getElementById('clientNameDisplay');
    const connectionBadge = document.getElementById('connectionBadge');
    const connLabel = document.getElementById('connLabel');

    // Buttons
    const addProjectBtn = document.getElementById('addProject');
    const emptyAddBtn = document.getElementById('emptyAddBtn');
    const openDashboardBtn = document.getElementById('openDashboard');
    const quitBtn = document.getElementById('quit');
    const editNameBtn = document.getElementById('editNameBtn');
    const winCloseBtn = document.getElementById('winClose');
    const winMinimizeBtn = document.getElementById('winMinimize');
    const backBtn = document.getElementById('backBtn');
    const backFromNameBtn = document.getElementById('backFromNameBtn');
    const pickFolderBtn = document.getElementById('pickFolderBtn');

    // Form
    const addProjectForm = document.getElementById('addProjectForm');
    const editNameForm = document.getElementById('editNameForm');
    const inputName = document.getElementById('inputName');
    const inputProjectName = document.getElementById('inputProjectName');
    const inputServer = document.getElementById('inputServer');
    const folderPath = document.getElementById('folderPath');
    const formError = document.getElementById('formError');
    const editNameInput = document.getElementById('editNameInput');

    let selectedFolder = null;
    let currentStatuses = [];
    let clientName = '';

    // ── Initialize ───────────────────────────────────────────────────────
    window.partsync.getConfig().then((config) => {
        clientName = config.clientName;
        clientNameDisplay.textContent = clientName;
        inputName.value = clientName;

        if (config.projects.length === 0) {
            showEmpty();
        } else {
            hideEmpty();
        }
    });

    // ── Navigation ───────────────────────────────────────────────────────
    function showView(view) {
        viewList.classList.add('hidden');
        viewAddProject.classList.add('hidden');
        viewEditName.classList.add('hidden');
        view.classList.remove('hidden');
    }

    function showListView() {
        showView(viewList);
    }

    function showAddProjectView() {
        selectedFolder = null;
        folderPath.textContent = 'No folder selected';
        folderPath.classList.remove('selected');
        inputProjectName.value = '';
        formError.classList.add('hidden');
        inputServer.value = 'https://partsyncserver-production.up.railway.app';
        // Keep the name from last time
        inputName.value = clientName;
        showView(viewAddProject);
        inputName.focus();
    }

    function showEditNameView() {
        editNameInput.value = clientName;
        showView(viewEditName);
        editNameInput.focus();
    }

    // ── Event Listeners ──────────────────────────────────────────────────
    addProjectBtn.addEventListener('click', () => showAddProjectView());
    emptyAddBtn.addEventListener('click', () => showAddProjectView());
    backBtn.addEventListener('click', () => showListView());
    backFromNameBtn.addEventListener('click', () => showListView());
    editNameBtn.addEventListener('click', () => showEditNameView());

    openDashboardBtn.addEventListener('click', () => {
        window.partsync.openDashboard();
    });

    quitBtn.addEventListener('click', () => {
        window.partsync.quit();
    });

    // ── Window Controls ──────────────────────────────────────────────────
    winCloseBtn.addEventListener('click', () => {
        window.partsync.closeWindow();
    });

    winMinimizeBtn.addEventListener('click', () => {
        window.partsync.minimizeWindow();
    });

    // ── Folder Picker ────────────────────────────────────────────────────
    pickFolderBtn.addEventListener('click', async () => {
        const path = await window.partsync.selectFolder();
        if (path) {
            selectedFolder = path;
            folderPath.textContent = path;
            folderPath.classList.add('selected');

            // Auto-fill project name from folder name if empty
            if (!inputProjectName.value) {
                const parts = path.split('/');
                inputProjectName.value = parts[parts.length - 1] || '';
            }
        }
    });

    // ── Add Project Form ─────────────────────────────────────────────────
    addProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = inputName.value.trim();
        const projectName = inputProjectName.value.trim();
        const serverUrl = inputServer.value.trim();

        if (!name) { showFormError('Please enter your name'); return; }
        if (!projectName) { showFormError('Please enter a project name'); return; }
        if (!selectedFolder) { showFormError('Please select a project folder'); return; }
        if (!serverUrl) { showFormError('Please enter a server URL'); return; }

        formError.classList.add('hidden');

        try {
            const result = await window.partsync.saveNewProject({
                name: projectName,
                localPath: selectedFolder,
                serverUrl: serverUrl,
                clientName: name,
            });

            if (result.success) {
                clientName = name;
                clientNameDisplay.textContent = clientName;
                showListView();
                hideEmpty();
            }
        } catch (err) {
            showFormError('Failed to save project: ' + err.message);
        }
    });

    // ── Edit Name Form ───────────────────────────────────────────────────
    editNameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = editNameInput.value.trim();
        if (!newName) return;

        await window.partsync.setClientName(newName);
        clientName = newName;
        clientNameDisplay.textContent = clientName;
        showListView();
    });

    // ── IPC: Show add project form (from tray menu) ──────────────────────
    window.partsync.onShowAddProject(() => showAddProjectView());

    // ── Status Updates ───────────────────────────────────────────────────
    window.partsync.onStatusUpdate((statuses) => {
        currentStatuses = statuses;
        renderProjects(statuses);
        updateConnectionBadge(statuses);
    });

    // ── Render ───────────────────────────────────────────────────────────

    function renderProjects(statuses) {
        if (statuses.length === 0) {
            showEmpty();
            return;
        }

        hideEmpty();

        // Remove old cards that no longer exist
        const existingCards = projectList.querySelectorAll('.project-card');
        existingCards.forEach(card => {
            if (!statuses.find(s => s.id === card.dataset.id)) {
                card.remove();
            }
        });

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
        const statusText = s.syncing ? 'Syncing' : (s.connected ? 'Connected' : 'Offline');
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
                <span class="project-status-label ${statusClass}">${statusText}</span>
            </div>
            <div class="project-meta">
                <span>📁 ${s.trackedFiles} files</span>
                <span>🕐 ${lastSync}</span>
            </div>
            <div class="project-path">${escapeHtml(s.localPath)}</div>
            ${locksHtml}
            ${s.error ? `<div style="font-size:11px;color:var(--accent-red);margin-top:6px">⚠️ ${escapeHtml(s.error)}</div>` : ''}
            <div class="project-actions">
                <button class="btn-sm toggle-btn" data-id="${s.id}">${s.connected ? '⏸ Pause' : '▶ Resume'}</button>
                <button class="btn-sm danger remove-btn" data-id="${s.id}">🗑 Remove</button>
            </div>
        `;

        // Attach event listeners
        const toggleBtn = card.querySelector('.toggle-btn');
        const removeBtn = card.querySelector('.remove-btn');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = toggleBtn.dataset.id;
            const isConnected = s.connected;
            window.partsync.toggleProject(id, !isConnected);
        });

        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = removeBtn.dataset.id;
            window.partsync.removeProject(id);
            card.remove();
            if (projectList.querySelectorAll('.project-card').length === 0) {
                showEmpty();
            }
        });
    }

    function updateConnectionBadge(statuses) {
        if (statuses.length === 0) {
            connectionBadge.className = 'connection-badge offline';
            connLabel.textContent = 'No projects';
            return;
        }

        const allConnected = statuses.every(s => s.connected);
        const anySyncing = statuses.some(s => s.syncing);

        if (anySyncing) {
            connectionBadge.className = 'connection-badge';
            connectionBadge.style.background = 'rgba(245, 158, 11, 0.1)';
            connectionBadge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
            connectionBadge.style.color = '#f59e0b';
            connLabel.textContent = 'Syncing...';
        } else if (allConnected) {
            connectionBadge.className = 'connection-badge';
            connectionBadge.style.background = '';
            connectionBadge.style.borderColor = '';
            connectionBadge.style.color = '';
            connLabel.textContent = 'Connected';
        } else {
            connectionBadge.className = 'connection-badge offline';
            connectionBadge.style.background = '';
            connectionBadge.style.borderColor = '';
            connectionBadge.style.color = '';
            connLabel.textContent = 'Offline';
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    function showEmpty() {
        emptyState.style.display = 'block';
        actionBar.style.display = 'none';
    }

    function hideEmpty() {
        emptyState.style.display = 'none';
        actionBar.style.display = 'flex';
    }

    function showFormError(msg) {
        formError.textContent = msg;
        formError.classList.remove('hidden');
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
