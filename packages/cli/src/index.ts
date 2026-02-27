#!/usr/bin/env node
// ─── PartSync CLI: Entry Point ───────────────────────────────────────────────

import { Command } from 'commander';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { VERSION, DEFAULT_PORT } from '@partsync/shared';
import { connect, disconnect } from './syncClient';
import { startWatcher, stopWatcher } from './watcher';
import { getAllLocks, releaseLock, emitEditLock } from './lockClient';

const program = new Command();

program
    .name('partsync')
    .description('⚡ PartSync — Real-time file sync for agent-first teams')
    .version(VERSION);

// ─── START ───────────────────────────────────────────────────────────────────

program
    .command('start')
    .description('Start watching and syncing files')
    .option('-s, --server <url>', 'PartSync server URL', `http://localhost:${DEFAULT_PORT}`)
    .option('-d, --dir <path>', 'Project directory to watch', '.')
    .option('-n, --name <name>', 'Client name', `${os.hostname()}-${process.pid}`)
    .option('-i, --ignore <patterns...>', 'Additional ignore patterns')
    .action(async (opts) => {
        const dir = path.resolve(opts.dir);
        const serverUrl = opts.server;
        const name = opts.name;
        const extraIgnore = opts.ignore || [];

        console.log('');
        console.log(chalk.bold.blue('  ⚡ PartSync v' + VERSION));
        console.log(chalk.gray('  Real-time file sync for agent-first teams'));
        console.log('');
        console.log(chalk.white(`  Server:  ${serverUrl}`));
        console.log(chalk.white(`  Dir:     ${dir}`));
        console.log(chalk.white(`  Client:  ${name}`));
        console.log('');

        // Connect to server
        connect(serverUrl, name, dir);

        // Start file watcher
        startWatcher(dir, name, extraIgnore);

        // Graceful shutdown
        const shutdown = () => {
            console.log('');
            console.log(chalk.yellow('  Shutting down...'));
            stopWatcher();
            disconnect();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Keep process alive
        console.log(chalk.gray('  Press Ctrl+C to stop'));
    });

// ─── STATUS ──────────────────────────────────────────────────────────────────

program
    .command('status')
    .description('Show current sync status and locks')
    .option('-s, --server <url>', 'PartSync server URL', `http://localhost:${DEFAULT_PORT}`)
    .action(async (opts) => {
        console.log(chalk.bold.blue('  ⚡ PartSync Status'));
        console.log('');

        try {
            const response = await fetch(`${opts.server}/health`);
            const data = await response.json() as any;
            console.log(chalk.green(`  Server: ${data.status}`));
            console.log(chalk.white(`  Version: ${data.version}`));
            console.log(chalk.white(`  Uptime: ${data.uptimeHuman}`));
        } catch {
            console.log(chalk.red(`  Server: unreachable (${opts.server})`));
        }
    });

// ─── LOCK ────────────────────────────────────────────────────────────────────

program
    .command('lock <file>')
    .description('Manually lock a file')
    .option('-s, --server <url>', 'PartSync server URL', `http://localhost:${DEFAULT_PORT}`)
    .option('-n, --name <name>', 'Client name', os.hostname())
    .action((file, opts) => {
        const sock = connect(opts.server, opts.name, '.');
        setTimeout(() => {
            emitEditLock(file, 'editing');
            console.log(chalk.green(`  🔒 Locked: ${file}`));
            setTimeout(() => { disconnect(); process.exit(0); }, 500);
        }, 1000);
    });

// ─── UNLOCK ──────────────────────────────────────────────────────────────────

program
    .command('unlock <file>')
    .description('Release a file lock')
    .option('-s, --server <url>', 'PartSync server URL', `http://localhost:${DEFAULT_PORT}`)
    .option('-n, --name <name>', 'Client name', os.hostname())
    .action((file, opts) => {
        const sock = connect(opts.server, opts.name, '.');
        setTimeout(() => {
            releaseLock(file);
            console.log(chalk.green(`  🔓 Unlocked: ${file}`));
            setTimeout(() => { disconnect(); process.exit(0); }, 500);
        }, 1000);
    });

program.parse();
