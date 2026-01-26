#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import ansiEscapes from 'ansi-escapes';
import App from './App.js';

// Enter full-screen alternate screen buffer
// This guarantees coordinates start at (0,0) and provides a clean terminal takeover
process.stdout.write(ansiEscapes.enterAlternativeScreen);
process.stdout.write(ansiEscapes.cursorHide);

// Render the app with exitOnCtrlC disabled
// This allows terminal tab to handle Ctrl+C for interrupting commands
const { waitUntilExit, cleanup } = render(<App />, {
	exitOnCtrlC: false, // Don't exit on Ctrl+C - let App handle it
});

// Cleanup handler for graceful exit
const exitHandler = () => {
	cleanup();
	process.stdout.write(ansiEscapes.cursorShow);
	process.stdout.write(ansiEscapes.exitAlternativeScreen);
};

// Handle graceful shutdown on various signals
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);
process.on('exit', exitHandler);

// Handle unexpected errors
process.on('uncaughtException', () => {
	exitHandler();
	process.exit(1);
});

process.on('unhandledRejection', () => {
	exitHandler();
	process.exit(1);
});

// Wait for clean exit
await waitUntilExit();

// Clean exit
exitHandler();
