// ─── PartSync Desktop: Preload Script ────────────────────────────────────────

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('partsync', {
    // Receive status updates from main process
    onStatusUpdate: (callback: (statuses: any[]) => void) => {
        ipcRenderer.on('status-update', (_event, statuses) => callback(statuses));
    },

    // Project management
    addProject: () => ipcRenderer.invoke('add-project'),
    removeProject: (id: string) => ipcRenderer.invoke('remove-project', id),
    toggleProject: (id: string, enabled: boolean) => ipcRenderer.invoke('toggle-project', id, enabled),

    // Config
    getConfig: () => ipcRenderer.invoke('get-config'),
    setClientName: (name: string) => ipcRenderer.invoke('set-client-name', name),

    // Actions
    openDashboard: () => ipcRenderer.invoke('open-dashboard'),
    quit: () => ipcRenderer.invoke('quit'),
});
