// ─── PartSync Desktop: Electron Main Process ─────────────────────────────────

// Catch uncaught errors
process.on('uncaughtException', (err) => {
    console.error(`[PartSync] UNCAUGHT: ${err.stack || err.message || err}`);
});
process.on('unhandledRejection', (reason) => {
    console.error(`[PartSync] UNHANDLED REJECTION: ${reason}`);
});

import { app, ipcMain, dialog, Notification, BrowserWindow } from 'electron';
import crypto from 'crypto';
import { createTray, showPopup } from './tray';
import * as projectManager from './projectManager';
import * as storeModule from './store';

// ─── Prevent app from quitting when all windows close (menu bar app) ────────
app.on('window-all-closed', () => {
    // Do NOT quit — we are a menu bar app, we stay alive via the tray icon
});

// ─── Single Instance Lock ────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // User double-clicked the app again — bring window to front
        showPopup();
        if (app.dock) app.dock.show();
    });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
    // Create tray (menu bar icon)
    createTray();

    // Start all enabled projects
    const projects = storeModule.getProjects();
    for (const project of projects) {
        if (project.enabled) {
            projectManager.startProject(project);
        }
    }

    // Always show the main window on launch so double-click feels responsive
    setTimeout(() => showPopup(), 500);

    // Show welcome notification on first launch
    if (projects.length === 0) {
        try {
            new Notification({
                title: '⚡ PartSync',
                body: 'Set up your first project to get started!',
            }).show();
        } catch (e) {
            console.log('[PartSync] Notification not available:', e);
        }
    }

    console.log(`[PartSync] Desktop app ready, ${projects.length} projects configured`);
});

app.on('before-quit', () => {
    projectManager.stopAll();
});

ipcMain.handle('get-config', () => {
    return {
        projects: storeModule.getProjects(),
        clientName: storeModule.getClientName(),
        autoLaunch: storeModule.getAutoLaunch(),
        notifications: storeModule.getNotificationsEnabled(),
    };
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Select Project Folder',
        properties: ['openDirectory'],
        message: 'Choose the project folder to sync',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('save-new-project', (_event, config: {
    name: string;
    localPath: string;
    serverUrl: string;
    clientName: string;
}) => {
    storeModule.setClientName(config.clientName);

    const project: storeModule.ProjectConfig = {
        id: crypto.randomUUID(),
        name: config.name,
        localPath: config.localPath,
        serverUrl: config.serverUrl,
        token: crypto.randomBytes(16).toString('hex'),
        enabled: true,
        ignorePatterns: [],
    };

    storeModule.addProject(project);
    projectManager.startProject(project);

    try {
        new Notification({
            title: '⚡ PartSync',
            body: `Project "${config.name}" is now syncing!`,
        }).show();
    } catch (e) { /* notifications may not be available */ }

    return { success: true, project };
});

ipcMain.handle('remove-project', (_event, id: string) => {
    projectManager.stopProject(id);
    storeModule.removeProject(id);
    return true;
});

ipcMain.handle('toggle-project', (_event, id: string, enabled: boolean) => {
    storeModule.updateProject(id, { enabled });
    if (enabled) {
        const project = storeModule.getProjects().find(p => p.id === id);
        if (project) projectManager.startProject(project);
    } else {
        projectManager.stopProject(id);
    }
    return true;
});

ipcMain.handle('set-client-name', (_event, name: string) => {
    storeModule.setClientName(name);
    return true;
});

ipcMain.handle('update-settings', (_event, settings: {
    autoLaunch?: boolean;
    notifications?: boolean;
}) => {
    if (settings.autoLaunch !== undefined) {
        storeModule.setAutoLaunch(settings.autoLaunch);
    }
    if (settings.notifications !== undefined) {
        storeModule.setNotificationsEnabled(settings.notifications);
    }
    return true;
});

ipcMain.handle('update-ignore-patterns', (_event, projectId: string, patterns: string[]) => {
    storeModule.updateProject(projectId, { ignorePatterns: patterns });
    // Restart the project to apply new patterns
    const project = storeModule.getProjects().find(p => p.id === projectId);
    if (project && project.enabled) {
        projectManager.stopProject(projectId);
        projectManager.startProject(project);
    }
    return true;
});

ipcMain.handle('resolve-conflict', (_event, projectId: string, file: string, resolution: string) => {
    projectManager.resolveConflict(projectId, file, resolution as 'accept-mine' | 'accept-theirs');
    return true;
});

ipcMain.handle('open-dashboard', () => {
    const projects = storeModule.getProjects();
    const url = projects.length > 0
        ? projects[0].serverUrl
        : 'https://partsyncserver-production.up.railway.app';
    require('electron').shell.openExternal(url);
    return true;
});

ipcMain.handle('get-share-info', (_event, projectId: string) => {
    const project = storeModule.getProjects().find(p => p.id === projectId);
    if (!project) return null;

    const shareData = {
        id: project.id,
        name: project.name,
        serverUrl: project.serverUrl,
        token: project.token,
    };
    return Buffer.from(JSON.stringify(shareData)).toString('base64');
});

ipcMain.handle('join-project', async (_event, inviteCode: string) => {
    try {
        const decoded = JSON.parse(Buffer.from(inviteCode, 'base64').toString('utf8'));
        if (!decoded.id || !decoded.name || !decoded.serverUrl || !decoded.token) {
            return { success: false, error: 'Invalid invite code' };
        }

        // Check if project already exists
        const existing = storeModule.getProjects().find(p => p.id === decoded.id);
        if (existing) {
            return { success: false, error: 'Project already added' };
        }

        // Ask user to pick the local folder for this project
        const result = await dialog.showOpenDialog({
            title: `Choose folder for "${decoded.name}"`,
            properties: ['openDirectory'],
            message: 'Select where to sync this project locally',
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, error: 'No folder selected' };
        }

        const project: storeModule.ProjectConfig = {
            id: decoded.id,
            name: decoded.name,
            localPath: result.filePaths[0],
            serverUrl: decoded.serverUrl,
            token: decoded.token,
            enabled: true,
            ignorePatterns: [],
        };

        storeModule.addProject(project);
        projectManager.startProject(project);

        try {
            new Notification({
                title: '⚡ PartSync',
                body: `Joined project "${decoded.name}" — syncing now!`,
            }).show();
        } catch (e) { /* notifications may not be available */ }

        return { success: true, project };
    } catch (e: any) {
        return { success: false, error: 'Invalid invite code: ' + (e.message || e) };
    }
});

ipcMain.handle('quit', () => {
    projectManager.stopAll();
    app.quit();
    return true;
});

