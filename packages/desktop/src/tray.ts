// ─── PartSync Desktop: Tray Manager ──────────────────────────────────────────

import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import path from 'path';
import { ProjectStatus } from './projectManager';
import * as projectManager from './projectManager';
import * as store from './store';

let tray: Tray | null = null;
let popupWindow: BrowserWindow | null = null;

export function createTray(): Tray {
    const icon = createTrayIcon('idle');
    tray = new Tray(icon);
    tray.setToolTip('PartSync — File Sync');

    updateTrayMenu([]);

    tray.on('click', () => {
        togglePopup();
    });

    // Listen for status changes
    projectManager.onStatusChange((statuses) => {
        updateTrayMenu(statuses);
        updateTrayIcon(statuses);

        // Send to popup window if open
        if (popupWindow && !popupWindow.isDestroyed()) {
            popupWindow.webContents.send('status-update', statuses);
        }
    });

    return tray;
}

export function showPopup(): void {
    if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.focus();
        return;
    }
    togglePopup();
}

function updateTrayIcon(statuses: ProjectStatus[]): void {
    if (!tray) return;

    const anyDisconnected = statuses.some(s => !s.connected);
    const anySyncing = statuses.some(s => s.syncing);
    const anyError = statuses.some(s => s.error);

    let state: 'idle' | 'syncing' | 'connected' | 'error';
    if (anyError) state = 'error';
    else if (anySyncing) state = 'syncing';
    else if (statuses.length > 0 && !anyDisconnected) state = 'connected';
    else state = 'idle';

    tray.setImage(createTrayIcon(state));
}

function createTrayIcon(state: 'idle' | 'syncing' | 'connected' | 'error'): Electron.NativeImage {
    const colors: Record<string, string> = {
        idle: '#6B7280',
        syncing: '#F59E0B',
        connected: '#10B981',
        error: '#EF4444',
    };

    const size = 32;
    const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="10" fill="${colors[state]}" />
      <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="white">⚡</text>
    </svg>
  `;

    return nativeImage.createFromBuffer(
        Buffer.from(canvas),
        { width: size, height: size }
    );
}

function updateTrayMenu(statuses: ProjectStatus[]): void {
    if (!tray) return;

    const projectItems: Electron.MenuItemConstructorOptions[] = statuses.map(s => ({
        label: `${s.connected ? '🟢' : '🔴'} ${s.name} (${s.trackedFiles} files)`,
        enabled: false,
    }));

    if (projectItems.length === 0) {
        projectItems.push({ label: 'No projects configured', enabled: false });
    }

    const template: Electron.MenuItemConstructorOptions[] = [
        { label: '⚡ PartSync', enabled: false },
        { type: 'separator' },
        ...projectItems,
        { type: 'separator' },
        {
            label: '➕ Add Project...',
            click: () => {
                showPopup();
                // Tell the renderer to show the add-project form
                setTimeout(() => {
                    if (popupWindow && !popupWindow.isDestroyed()) {
                        popupWindow.webContents.send('show-add-project');
                    }
                }, 300);
            },
        },
        {
            label: '🌐 Open Dashboard',
            click: () => {
                const projects = store.getProjects();
                const serverUrl = projects.length > 0
                    ? projects[0]?.serverUrl || 'https://partsyncserver-production.up.railway.app'
                    : 'https://partsyncserver-production.up.railway.app';
                const { shell } = require('electron');
                shell.openExternal(serverUrl);
            },
        },
        { type: 'separator' },
        {
            label: '⚙️ Open PartSync',
            click: () => togglePopup(),
        },
        {
            label: 'Quit PartSync',
            click: () => {
                projectManager.stopAll();
                app.quit();
            },
        },
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
}

function togglePopup(): void {
    if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.close();
        popupWindow = null;
        return;
    }

    popupWindow = new BrowserWindow({
        width: 400,
        height: 560,
        show: false,
        frame: false,
        resizable: false,
        fullscreenable: false,
        transparent: true,
        vibrancy: 'popover',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    popupWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

    // Position near tray
    if (tray) {
        const trayBounds = tray.getBounds();
        const windowBounds = popupWindow.getBounds();
        const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
        const y = Math.round(trayBounds.y + trayBounds.height);
        popupWindow.setPosition(x, y, false);
    }

    popupWindow.show();
    popupWindow.on('blur', () => {
        if (popupWindow && !popupWindow.isDestroyed()) {
            popupWindow.close();
            popupWindow = null;
        }
    });
}

export { tray };
