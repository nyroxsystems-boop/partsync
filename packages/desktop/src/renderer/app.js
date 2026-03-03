// ─── PartSync Desktop: Renderer App ──────────────────────────────────────────
(function () {
    'use strict';

    // ── DOM Elements ─────────────────────────────────────────────────────
    const viewList = document.getElementById('viewList');
    const viewAddProject = document.getElementById('viewAddProject');
    const viewEditName = document.getElementById('viewEditName');
    const viewJoinProject = document.getElementById('viewJoinProject');
    const viewActivity = document.getElementById('viewActivity');
    const viewSettings = document.getElementById('viewSettings');
    const viewConflicts = document.getElementById('viewConflicts');

    const projectList = document.getElementById('projectList');
    const emptyState = document.getElementById('emptyState');
    const actionBar = document.getElementById('actionBar');
    const clientNameDisplay = document.getElementById('clientNameDisplay');
    const connectionBadge = document.getElementById('connectionBadge');
    const connLabel = document.getElementById('connLabel');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const tabBar = document.getElementById('tabBar');

    // Peers
    const peersBar = document.getElementById('peersBar');
    const peersList = document.getElementById('peersList');

    // Conflicts
    const conflictBanner = document.getElementById('conflictBanner');
    const conflictText = document.getElementById('conflictText');
    const showConflictsBtn = document.getElementById('showConflictsBtn');
    const conflictsList = document.getElementById('conflictsList');
    const conflictsEmpty = document.getElementById('conflictsEmpty');
    const backFromConflictsBtn = document.getElementById('backFromConflictsBtn');

    // Activity
    const activityLog = document.getElementById('activityLog');
    const activityEmpty = document.getElementById('activityEmpty');

    // Settings
    const settingAutoLaunch = document.getElementById('settingAutoLaunch');
    const settingNotifications = document.getElementById('settingNotifications');
    const settingsNameInput = document.getElementById('settingsNameInput');
    const settingsSaveNameBtn = document.getElementById('settingsSaveNameBtn');
    const ignorePatternsInput = document.getElementById('ignorePatternsInput');
    const saveIgnoreBtn = document.getElementById('saveIgnoreBtn');

    // Buttons
    const addProjectBtn = document.getElementById('addProject');
    const emptyAddBtn = document.getElementById('emptyAddBtn');
    const joinProjectBtn = document.getElementById('joinProjectBtn');
    const openDashboardBtn = document.getElementById('openDashboard');
    const quitBtn = document.getElementById('quit');
    const editNameBtn = document.getElementById('editNameBtn');
    const winCloseBtn = document.getElementById('winClose');
    const winMinimizeBtn = document.getElementById('winMinimize');
    const winMaximizeBtn = document.getElementById('winMaximize');
    const backBtn = document.getElementById('backBtn');
    const backFromNameBtn = document.getElementById('backFromNameBtn');
    const backFromJoinBtn = document.getElementById('backFromJoinBtn');
    const pickFolderBtn = document.getElementById('pickFolderBtn');

    // Forms
    const addProjectForm = document.getElementById('addProjectForm');
    const editNameForm = document.getElementById('editNameForm');
    const joinProjectForm = document.getElementById('joinProjectForm');
    const inputName = document.getElementById('inputName');
    const inputProjectName = document.getElementById('inputProjectName');
    const inputServer = document.getElementById('inputServer');
    const folderPath = document.getElementById('folderPath');
    const formError = document.getElementById('formError');
    const editNameInput = document.getElementById('editNameInput');
    const inviteCodeInput = document.getElementById('inviteCodeInput');
    const joinFormError = document.getElementById('joinFormError');

    let selectedFolder = null;
    let currentStatuses = [];
    let clientName = '';
    let currentTab = 'projects';
    let projectConfigs = [];

    // All tab-controlled views
    const allViews = [viewList, viewAddProject, viewEditName, viewJoinProject, viewActivity, viewSettings, viewConflicts];
    const tabViews = { projects: viewList, activity: viewActivity, settings: viewSettings };

    // ── Initialize ───────────────────────────────────────────────────────
    window.partsync.getConfig().then(function (config) {
        clientName = config.clientName;
        clientNameDisplay.textContent = clientName;
        inputName.value = clientName;
        settingsNameInput.value = clientName;
        projectConfigs = config.projects;

        // Settings
        settingAutoLaunch.checked = config.autoLaunch !== false;
        settingNotifications.checked = config.notifications !== false;

        // Load ignore patterns from first project
        if (config.projects.length > 0 && config.projects[0].ignorePatterns) {
            ignorePatternsInput.value = config.projects[0].ignorePatterns.join('\n');
        }

        if (config.projects.length === 0) {
            showEmpty();
        } else {
            hideEmpty();
        }
    });

    // ── Tab Navigation ───────────────────────────────────────────────────
    tabBar.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab');
        if (!btn) return;
        var tab = btn.dataset.tab;
        switchTab(tab);
    });

    function switchTab(tab) {
        currentTab = tab;
        // Update tab buttons
        tabBar.querySelectorAll('.tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        // Show the right view
        allViews.forEach(function (v) { v.classList.add('hidden'); });
        if (tabViews[tab]) tabViews[tab].classList.remove('hidden');
    }

    // ── Navigation (sub-views) ──────────────────────────────────────────
    function showSubView(view) {
        allViews.forEach(function (v) { v.classList.add('hidden'); });
        view.classList.remove('hidden');
    }

    function showAddProjectView() {
        selectedFolder = null;
        folderPath.textContent = 'No folder selected';
        folderPath.classList.remove('selected');
        inputProjectName.value = '';
        formError.classList.add('hidden');
        inputServer.value = 'https://partsyncserver-production.up.railway.app';
        inputName.value = clientName;
        showSubView(viewAddProject);
        inputName.focus();
    }

    function showEditNameView() {
        editNameInput.value = clientName;
        showSubView(viewEditName);
        editNameInput.focus();
    }

    function showJoinProjectView() {
        inviteCodeInput.value = '';
        joinFormError.classList.add('hidden');
        showSubView(viewJoinProject);
        inviteCodeInput.focus();
    }

    function showConflictsView() {
        showSubView(viewConflicts);
    }

    function backToCurrentTab() {
        switchTab(currentTab);
    }

    // ── Toast ────────────────────────────────────────────────────────────
    function showToast(message, duration) {
        duration = duration || 2000;
        toastMessage.textContent = message;
        toast.classList.remove('hidden');
        toast.offsetHeight; // reflow
        toast.classList.add('show');
        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.classList.add('hidden'); }, 300);
        }, duration);
    }

    // ── Event Listeners ──────────────────────────────────────────────────
    addProjectBtn.addEventListener('click', function () { showAddProjectView(); });
    emptyAddBtn.addEventListener('click', function () { showAddProjectView(); });
    joinProjectBtn.addEventListener('click', function () { showJoinProjectView(); });
    backBtn.addEventListener('click', function () { backToCurrentTab(); });
    backFromNameBtn.addEventListener('click', function () { backToCurrentTab(); });
    backFromJoinBtn.addEventListener('click', function () { backToCurrentTab(); });
    backFromConflictsBtn.addEventListener('click', function () { backToCurrentTab(); });
    editNameBtn.addEventListener('click', function () { showEditNameView(); });
    showConflictsBtn.addEventListener('click', function () { showConflictsView(); });

    openDashboardBtn.addEventListener('click', function () { window.partsync.openDashboard(); });
    quitBtn.addEventListener('click', function () { window.partsync.quit(); });

    // Window controls
    winCloseBtn.addEventListener('click', function () { window.partsync.closeWindow(); });
    winMinimizeBtn.addEventListener('click', function () { window.partsync.minimizeWindow(); });
    winMaximizeBtn.addEventListener('click', function () { window.partsync.maximizeWindow(); });

    // Folder picker
    pickFolderBtn.addEventListener('click', async function () {
        var p = await window.partsync.selectFolder();
        if (p) {
            selectedFolder = p;
            folderPath.textContent = p;
            folderPath.classList.add('selected');
            if (!inputProjectName.value) {
                var parts = p.split('/');
                inputProjectName.value = parts[parts.length - 1] || '';
            }
        }
    });

    // ── Settings Handlers ────────────────────────────────────────────────
    settingAutoLaunch.addEventListener('change', function () {
        window.partsync.updateSettings({ autoLaunch: settingAutoLaunch.checked });
        showToast(settingAutoLaunch.checked ? 'Auto-launch enabled' : 'Auto-launch disabled');
    });

    settingNotifications.addEventListener('change', function () {
        window.partsync.updateSettings({ notifications: settingNotifications.checked });
        showToast(settingNotifications.checked ? 'Notifications enabled' : 'Notifications disabled');
    });

    settingsSaveNameBtn.addEventListener('click', async function () {
        var name = settingsNameInput.value.trim();
        if (!name) return;
        await window.partsync.setClientName(name);
        clientName = name;
        clientNameDisplay.textContent = clientName;
        showToast('Name updated! ✅');
    });

    saveIgnoreBtn.addEventListener('click', async function () {
        var patterns = ignorePatternsInput.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean);
        // Apply to all projects
        for (var i = 0; i < projectConfigs.length; i++) {
            await window.partsync.updateIgnorePatterns(projectConfigs[i].id, patterns);
        }
        showToast('Ignore patterns saved! 🎯');
    });

    // ── Add Project Form ─────────────────────────────────────────────────
    addProjectForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var name = inputName.value.trim();
        var projectName = inputProjectName.value.trim();
        var serverUrl = inputServer.value.trim();

        if (!name) { showFormError('Please enter your name'); return; }
        if (!projectName) { showFormError('Please enter a project name'); return; }
        if (!selectedFolder) { showFormError('Please select a project folder'); return; }
        if (!serverUrl) { showFormError('Please enter a server URL'); return; }

        formError.classList.add('hidden');
        try {
            var result = await window.partsync.saveNewProject({
                name: projectName, localPath: selectedFolder,
                serverUrl: serverUrl, clientName: name,
            });
            if (result.success) {
                clientName = name;
                clientNameDisplay.textContent = clientName;
                switchTab('projects');
                hideEmpty();
                showToast('Project created! 🚀');
            }
        } catch (err) { showFormError('Failed to save project: ' + err.message); }
    });

    // ── Edit Name Form ───────────────────────────────────────────────────
    editNameForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var newName = editNameInput.value.trim();
        if (!newName) return;
        await window.partsync.setClientName(newName);
        clientName = newName;
        clientNameDisplay.textContent = clientName;
        settingsNameInput.value = clientName;
        backToCurrentTab();
        showToast('Name updated! ✅');
    });

    // ── Join Project Form ────────────────────────────────────────────────
    joinProjectForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var code = inviteCodeInput.value.trim();
        if (!code) { showJoinFormError('Please paste an invite code'); return; }
        joinFormError.classList.add('hidden');
        try {
            var result = await window.partsync.joinProject(code);
            if (result.success) {
                switchTab('projects');
                hideEmpty();
                showToast('Joined project! 🎉');
            } else {
                showJoinFormError(result.error || 'Failed to join');
            }
        } catch (err) { showJoinFormError('Invalid invite code: ' + (err.message || err)); }
    });

    // ── IPC Events ───────────────────────────────────────────────────────
    window.partsync.onShowAddProject(function () { showAddProjectView(); });

    window.partsync.onStatusUpdate(function (statuses) {
        currentStatuses = statuses;
        renderProjects(statuses);
        updateConnectionBadge(statuses);
        renderPeers(statuses);
        renderActivityLog(statuses);
        renderConflicts(statuses);
    });

    // ── Render: Projects ─────────────────────────────────────────────────
    function renderProjects(statuses) {
        if (statuses.length === 0) { showEmpty(); return; }
        hideEmpty();

        var existingCards = projectList.querySelectorAll('.project-card');
        existingCards.forEach(function (card) {
            if (!statuses.find(function (s) { return s.id === card.dataset.id; })) card.remove();
        });

        statuses.forEach(function (s) {
            var card = projectList.querySelector('[data-id="' + s.id + '"]');
            if (!card) {
                card = createProjectCard(s);
                projectList.appendChild(card);
            } else {
                updateProjectCard(card, s);
            }
        });
    }

    function createProjectCard(s) {
        var card = document.createElement('div');
        card.className = 'project-card';
        card.dataset.id = s.id;
        updateProjectCard(card, s);
        return card;
    }

    function updateProjectCard(card, s) {
        var statusClass = s.syncing ? 'syncing' : (s.connected ? 'connected' : 'disconnected');
        var statusText = s.syncing ? 'Syncing' : (s.connected ? 'Connected' : 'Offline');
        var lastSync = s.lastSync > 0 ? timeAgo(s.lastSync) : 'never';

        var locksHtml = '';
        if (s.locks && s.locks.length > 0) {
            locksHtml = '<div class="project-locks">' +
                s.locks.map(function (l) {
                    return '<span class="lock-tag ' + (l.lockType === 'ai-writing' ? 'ai' : '') + '">' +
                        (l.lockType === 'ai-writing' ? '🤖' : '🔒') + ' ' + esc(l.file) + '</span>';
                }).join('') + '</div>';
        }

        // Online peers count for this project
        var peerCount = (s.peers || []).length;
        var peerBadge = peerCount > 0 ? '<span style="font-size:10px;color:var(--accent-green);">👥 ' + peerCount + ' online</span>' : '';

        card.innerHTML =
            '<div class="project-header">' +
            '<div class="project-name"><span class="status-dot ' + statusClass + '"></span>' + esc(s.name) + '</div>' +
            '<span class="project-status-label ' + statusClass + '">' + statusText + '</span>' +
            '</div>' +
            '<div class="project-meta">' +
            '<span>📁 ' + s.trackedFiles + ' files</span>' +
            '<span>🕐 ' + lastSync + '</span>' + peerBadge +
            '</div>' +
            '<div class="project-path">' + esc(s.localPath) + '</div>' +
            locksHtml +
            (s.error ? '<div style="font-size:11px;color:var(--accent-red);margin-top:6px">⚠️ ' + esc(s.error) + '</div>' : '') +
            '<div class="project-actions">' +
            '<button class="btn-sm toggle-btn" data-id="' + s.id + '">' + (s.connected ? '⏸ Pause' : '▶ Resume') + '</button>' +
            '<button class="btn-sm share share-btn" data-id="' + s.id + '">📤 Share</button>' +
            '<button class="btn-sm danger remove-btn" data-id="' + s.id + '">🗑 Remove</button>' +
            '</div>';

        // Events
        card.querySelector('.toggle-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            window.partsync.toggleProject(s.id, !s.connected);
        });

        card.querySelector('.share-btn').addEventListener('click', async function (e) {
            e.stopPropagation();
            try {
                var code = await window.partsync.getShareInfo(s.id);
                if (code) { await navigator.clipboard.writeText(code); showToast('Invite code copied! 📋'); }
                else { showToast('Could not generate invite code'); }
            } catch (err) { showToast('Copy failed — check permissions'); }
        });

        card.querySelector('.remove-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            window.partsync.removeProject(s.id);
            card.remove();
            if (projectList.querySelectorAll('.project-card').length === 0) showEmpty();
            showToast('Project removed');
        });
    }

    // ── Render: Peers ────────────────────────────────────────────────────
    function renderPeers(statuses) {
        // Collect all unique peers from all projects
        var allPeers = {};
        statuses.forEach(function (s) {
            (s.peers || []).forEach(function (p) { allPeers[p.name] = p; });
        });

        var peerNames = Object.keys(allPeers);
        if (peerNames.length === 0) {
            peersBar.classList.add('hidden');
            return;
        }

        peersBar.classList.remove('hidden');
        peersList.innerHTML = peerNames.map(function (name) {
            var isYou = name === clientName;
            return '<span class="peer-tag' + (isYou ? ' you' : '') + '">' + esc(name) + (isYou ? ' (you)' : '') + '</span>';
        }).join('');
    }

    // ── Render: Activity Log ─────────────────────────────────────────────
    function renderActivityLog(statuses) {
        // Merge activity from all projects and sort by time
        var allActivity = [];
        statuses.forEach(function (s) {
            (s.activityLog || []).forEach(function (a) {
                a._projectName = s.name;
                allActivity.push(a);
            });
        });
        allActivity.sort(function (a, b) { return b.timestamp - a.timestamp; });

        if (allActivity.length === 0) {
            activityEmpty.style.display = 'block';
            // Remove rendered entries
            var entries = activityLog.querySelectorAll('.activity-entry');
            entries.forEach(function (e) { e.remove(); });
            return;
        }

        activityEmpty.style.display = 'none';

        // Re-render (simple for now)
        var html = allActivity.slice(0, 50).map(function (a) {
            var icon = '📄';
            if (a.type === 'conflict') icon = '⚠️';
            else if (a.type === 'peer-joined') icon = '🟢';
            else if (a.type === 'peer-left') icon = '🔴';
            else if (a.type === 'file-deleted') icon = '🗑';
            else if (a.type === 'file-renamed') icon = '📝';

            return '<div class="activity-entry">' +
                '<span class="activity-icon">' + icon + '</span>' +
                '<div class="activity-body">' +
                '<div class="activity-message">' + esc(a.message) + '</div>' +
                '<div class="activity-time">' + timeAgo(a.timestamp) + '</div>' +
                '</div>' +
                '</div>';
        }).join('');

        // Replace content but keep the empty state element
        var existingEntries = activityLog.querySelectorAll('.activity-entry');
        existingEntries.forEach(function (e) { e.remove(); });
        activityLog.insertAdjacentHTML('afterbegin', html);
    }

    // ── Render: Conflicts ────────────────────────────────────────────────
    function renderConflicts(statuses) {
        var allConflicts = [];
        statuses.forEach(function (s) {
            (s.conflicts || []).forEach(function (c) {
                c._projectId = s.id;
                c._projectName = s.name;
                allConflicts.push(c);
            });
        });

        // Banner
        if (allConflicts.length > 0) {
            conflictBanner.classList.remove('hidden');
            conflictText.textContent = allConflicts.length + ' conflict' + (allConflicts.length > 1 ? 's' : '') + ' detected';
        } else {
            conflictBanner.classList.add('hidden');
        }

        // Conflicts list view
        if (allConflicts.length === 0) {
            conflictsEmpty.style.display = 'block';
            var cards = conflictsList.querySelectorAll('.conflict-card');
            cards.forEach(function (c) { c.remove(); });
            return;
        }

        conflictsEmpty.style.display = 'none';
        var existingCards = conflictsList.querySelectorAll('.conflict-card');
        existingCards.forEach(function (c) { c.remove(); });

        allConflicts.forEach(function (c) {
            var card = document.createElement('div');
            card.className = 'conflict-card';
            card.innerHTML =
                '<div class="conflict-card-header">' +
                '<span>⚠️</span>' +
                '<span class="conflict-card-file">' + esc(c.file) + '</span>' +
                '</div>' +
                '<div class="conflict-card-info">' +
                esc(c.authorA) + ' vs ' + esc(c.authorB) + ' · ' + timeAgo(c.timestamp) +
                '</div>' +
                '<div class="conflict-card-actions">' +
                '<button class="btn-sm btn-conflict-mine">Keep Mine</button>' +
                '<button class="btn-sm btn-conflict-theirs">Accept Theirs</button>' +
                '</div>';

            card.querySelector('.btn-conflict-mine').addEventListener('click', function () {
                window.partsync.resolveConflict(c._projectId, c.file, 'accept-mine');
                card.remove();
                showToast('Kept your version ✅');
            });
            card.querySelector('.btn-conflict-theirs').addEventListener('click', function () {
                window.partsync.resolveConflict(c._projectId, c.file, 'accept-theirs');
                card.remove();
                showToast('Accepted their version ✅');
            });

            conflictsList.insertBefore(card, conflictsEmpty);
        });
    }

    // ── Connection Badge ─────────────────────────────────────────────────
    function updateConnectionBadge(statuses) {
        if (statuses.length === 0) {
            connectionBadge.className = 'connection-badge offline';
            connLabel.textContent = 'No projects';
            return;
        }
        var allConnected = statuses.every(function (s) { return s.connected; });
        var anySyncing = statuses.some(function (s) { return s.syncing; });

        if (anySyncing) {
            connectionBadge.className = 'connection-badge';
            connectionBadge.style.cssText = 'background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.2);color:#f59e0b;';
            connLabel.textContent = 'Syncing...';
        } else if (allConnected) {
            connectionBadge.className = 'connection-badge';
            connectionBadge.style.cssText = '';
            connLabel.textContent = 'Connected';
        } else {
            connectionBadge.className = 'connection-badge offline';
            connectionBadge.style.cssText = '';
            connLabel.textContent = 'Offline';
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    function showEmpty() { emptyState.style.display = 'block'; actionBar.style.display = 'none'; }
    function hideEmpty() { emptyState.style.display = 'none'; actionBar.style.display = 'flex'; }
    function showFormError(msg) { formError.textContent = msg; formError.classList.remove('hidden'); }
    function showJoinFormError(msg) { joinFormError.textContent = msg; joinFormError.classList.remove('hidden'); }

    function timeAgo(ts) {
        var diff = Date.now() - ts;
        var s = Math.floor(diff / 1000);
        if (s < 10) return 'just now';
        if (s < 60) return s + 's ago';
        var m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        return Math.floor(m / 60) + 'h ago';
    }

    function esc(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
})();
