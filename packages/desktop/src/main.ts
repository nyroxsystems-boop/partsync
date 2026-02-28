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
        showPopup();
    });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
    // Hide dock icon (menu bar app only)
    if (app.dock) app.dock.hide();

    // Create tray
    createTray();

    // Start all enabled projects
    const projects = storeModule.getProjects();
    for (const project of projects) {
        if (project.enabled) {
            projectManager.startProject(project);
        }
    }

    // Show welcome notification + open popup on first launch
    if (projects.length === 0) {
        try {
            new Notification({
                title: '⚡ PartSync',
                body: 'Click the menu bar icon to set up your first project!',
            }).show();
        } catch (e) {
            console.log('[PartSync] Notification not available:', e);
        }
        setTimeout(() => showPopup(), 800);
    }

    console.log(`[PartSync] Desktop app ready, ${projects.length} projects configured`);
});

app.on('before-quit', () => {
    projectManager.stopAll();
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => {
    return {
        projects: storeModule.getProjects(),
        clientName: storeModule.getClientName(),
        autoLaunch: storeModule.getAutoLaunch(),
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

ipcMain.handle('open-dashboard', () => {
    const projects = storeModule.getProjects();
    const url = projects.length > 0
        ? projects[0].serverUrl
        : 'https://partsyncserver-production.up.railway.app';
    require('electron').shell.openExternal(url);
    return true;
});

ipcMain.handle('quit', () => {
    projectManager.stopAll();
    app.quit();
    return true;
});
