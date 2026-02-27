// ─── PartSync Desktop: Electron Main Process ─────────────────────────────────

import { app, ipcMain, Notification } from 'electron';
import { createTray } from './tray';
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

    // Show welcome notification on first launch
    if (projects.length === 0) {
        new Notification({
            title: '⚡ PartSync',
            body: 'Click the menu bar icon to add your first project!',
        }).show();
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

ipcMain.handle('add-project', async () => {
    // This is handled by the tray's addProjectDialog
    return true;
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
