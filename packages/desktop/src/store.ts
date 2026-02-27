// ─── PartSync Desktop: Persistent Config Store ──────────────────────────────

import Store from 'electron-store';

interface ProjectConfig {
    id: string;
    name: string;
    localPath: string;
    serverUrl: string;
    token: string;
    enabled: boolean;
    ignorePatterns: string[];
}

interface AppConfig {
    projects: ProjectConfig[];
    clientName: string;
    autoLaunch: boolean;
    notifications: boolean;
    theme: 'dark' | 'light';
}

const store = new Store<AppConfig>({
    name: 'partsync-config',
    defaults: {
        projects: [],
        clientName: require('os').hostname(),
        autoLaunch: true,
        notifications: true,
        theme: 'dark',
    },
});

export function getProjects(): ProjectConfig[] {
    return store.get('projects');
}

export function addProject(project: ProjectConfig): void {
    const projects = getProjects();
    projects.push(project);
    store.set('projects', projects);
}

export function removeProject(id: string): void {
    const projects = getProjects().filter(p => p.id !== id);
    store.set('projects', projects);
}

export function updateProject(id: string, updates: Partial<ProjectConfig>): void {
    const projects = getProjects().map(p =>
        p.id === id ? { ...p, ...updates } : p
    );
    store.set('projects', projects);
}

export function getClientName(): string {
    return store.get('clientName');
}

export function setClientName(name: string): void {
    store.set('clientName', name);
}

export function getAutoLaunch(): boolean {
    return store.get('autoLaunch');
}

export function setAutoLaunch(enabled: boolean): void {
    store.set('autoLaunch', enabled);
}

export function getNotificationsEnabled(): boolean {
    return store.get('notifications');
}

export type { ProjectConfig, AppConfig };
export { store };
