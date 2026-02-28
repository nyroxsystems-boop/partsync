// ─── PartSync Desktop: Electron Main Process ─────────────────────────────────

import { app, ipcMain, dialog, Notification } from 'electron';
import crypto from 'crypto';
import { createTray, showPopup } from './tray';
import * as projectManager from './projectManager';
import * as storeModule from './store';

// ─── Single Instance Lock ────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.on('ready', () => {
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
        new Notification({
            title: '⚡ PartSync',
            body: 'Click the menu bar icon to set up your first project!',
        }).show();
        // Auto-open popup on first launch so user sees the onboarding
        setTimeout(() => showPopup(), 500);
    }

    console.log(`[PartSync] Desktop app ready, ${projects.length} projects configured`);
});

app.on('window-all-closed', (e: Event) => {
    // Prevent app from quitting when windows close (we're a menu bar app)
    e.preventDefault();
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
    // Save client name
    storeModule.setClientName(config.clientName);

    // Create project config
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

    new Notification({
        title: '⚡ PartSync',
        body: `Project "${config.name}" is now syncing!`,
    }).show();

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
