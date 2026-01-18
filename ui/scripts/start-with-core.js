#!/usr/bin/env node

/**
 * Start script that spawns the heyvm-core backend and launches the UI
 * This establishes the stdio IPC connection between UI and backend
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to core binary
const coreBinaryPath = join(__dirname, '../../bin/heyvm-core');

// Check if core binary exists
if (!existsSync(coreBinaryPath)) {
	console.error('Error: heyvm-core binary not found at:', coreBinaryPath);
	console.error('Please build the core backend first:');
	console.error('  cd core && go build -o ../bin/heyvm-core ./cmd/heyvm-core');
	process.exit(1);
}

console.log('Starting heyvm-core backend...');

// Spawn the core process with piped stdio for IPC
const coreProcess = spawn(coreBinaryPath, [], {
	stdio: ['pipe', 'pipe', 'inherit'], // stdin/stdout for IPC, stderr to console
});

// Handle core process errors
coreProcess.on('error', (err) => {
	console.error('Failed to start heyvm-core:', err);
	process.exit(1);
});

coreProcess.on('exit', (code, signal) => {
	if (code !== null && code !== 0) {
		console.error(`heyvm-core exited with code ${code}`);
	}
	if (signal) {
		console.error(`heyvm-core killed by signal ${signal}`);
	}
	process.exit(code || 0);
});

// Make core process streams available globally BEFORE importing UI
// This allows the IPC client to access them during initialization
global.heyvmCore = {
	stdin: coreProcess.stdin,
	stdout: coreProcess.stdout,
	process: coreProcess,
};

console.log('heyvm-core started, launching UI...');

// Small delay to ensure core is ready
await new Promise(resolve => setTimeout(resolve, 100));

// Import and run the UI
// The UI's process.stdin/stdout will still be connected to the terminal for Ink
import('../dist/index.js').catch((err) => {
	console.error('Failed to start UI:', err);
	coreProcess.kill();
	process.exit(1);
});

// Handle cleanup on exit
process.on('SIGINT', () => {
	console.log('\nShutting down...');
	coreProcess.kill('SIGTERM');
	setTimeout(() => process.exit(0), 100);
});

process.on('SIGTERM', () => {
	coreProcess.kill('SIGTERM');
	setTimeout(() => process.exit(0), 100);
});
