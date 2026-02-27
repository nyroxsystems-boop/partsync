# ⚡ PartSync

**Real-time diff-based file sync for agent-first developer teams.**

PartSync is a live synchronization layer that acts like "Google Docs for code" — optimized for backend TypeScript projects with AI-assisted workflows.

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────────────┐
│  Developer A    │◄──────────────────►│   PartSync Server        │
│  (partsync CLI) │     (diffs)         │   (Express + Socket.IO)  │
└─────────────────┘                     │                          │
                                        │  ┌──────────────────┐   │
┌─────────────────┐     WebSocket      │  │  SQLite DB        │   │
│  Developer B    │◄──────────────────►│  │  (Diff History)   │   │
│  (partsync CLI) │     (diffs)         │  └──────────────────┘   │
└─────────────────┘                     │                          │
                                        │  ┌──────────────────┐   │
                                        │  │  Web Dashboard    │   │
                                        │  │  (Dark Mode UI)   │   │
                                        │  └──────────────────┘   │
                                        └──────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Start Server

```bash
npm run start
# → Server on http://localhost:3777
# → Dashboard on http://localhost:3777
```

### 4. Start CLI Client

```bash
# In another terminal, from your project directory:
npx partsync start --server http://localhost:3777 --dir ./my-project --name "my-machine"
```

## CLI Commands

| Command | Description |
|---------|------------|
| `partsync start` | Start watching and syncing files |
| `partsync status` | Show server health and sync status |
| `partsync lock <file>` | Manually lock a file |
| `partsync unlock <file>` | Release a file lock |

### Options for `partsync start`

| Flag | Default | Description |
|------|---------|------------|
| `-s, --server <url>` | `http://localhost:3777` | Server URL |
| `-d, --dir <path>` | `.` | Directory to watch |
| `-n, --name <name>` | `hostname-pid` | Client identifier |
| `-i, --ignore <patterns>` | — | Additional ignore patterns |

## Features

- **Diff-based sync** — Only sends changes, not full files
- **AI agent detection** — Detects rapid-fire AI writes and tags them
- **Soft locking** — Warns when two users edit the same file
- **Conflict resolution** — Auto-merges safe changes, creates `.conflict-{ts}.ts` for overlaps
- **Reconnection** — Queues diffs offline, replays on reconnect
- **100-diff undo history** — Per-file undo via the dashboard
- **Web Dashboard** — Dark-mode UI with live status, locks, and change feed

## Deployment

### Railway

```bash
railway login
railway init
railway up
```

The server is configured with a `Dockerfile` and `railway.toml` for seamless deployment.

## Project Structure

```
partsync/
├── packages/
│   ├── shared/          # Shared types, schema, constants
│   ├── server/          # Express + Socket.IO + Dashboard
│   │   └── src/
│   │       ├── dashboard/   # Static web UI
│   │       ├── db.ts
│   │       ├── lockManager.ts
│   │       ├── diffStore.ts
│   │       ├── conflictResolver.ts
│   │       ├── socketHandlers.ts
│   │       └── index.ts
│   └── cli/             # CLI client
│       └── src/
│           ├── diffEngine.ts
│           ├── agentDetector.ts
│           ├── lockClient.ts
│           ├── syncClient.ts
│           ├── watcher.ts
│           └── index.ts
├── Dockerfile
├── railway.toml
└── package.json
```

## License

MIT © NyroxSystems
