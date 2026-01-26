#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import App from './App.js';

// Render the app with exitOnCtrlC disabled
// This allows terminal tab to handle Ctrl+C for interrupting commands
const { waitUntilExit } = render(<App />, {
	exitOnCtrlC: false, // Don't exit on Ctrl+C - let App handle it
});

// Wait for clean exit
waitUntilExit();
