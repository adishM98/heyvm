#!/usr/bin/env node

/**
 * Post-install script for heyvm
 * Builds the Go backend when installed globally via npm
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🚀 Setting up heyvm...\n');

// Check if Go is installed
function checkGo() {
	return new Promise((resolve) => {
		const goVersion = spawn('go', ['version']);

		goVersion.on('error', () => {
			console.log('⚠️  Go not found - you will need Go >= 1.21 to use heyvm');
			console.log('   Download from: https://go.dev/dl/\n');
			resolve(false);
		});

		goVersion.on('close', (code) => {
			if (code === 0) {
				console.log('✓ Go is installed');
				resolve(true);
			} else {
				console.log('⚠️  Could not verify Go installation');
				resolve(false);
			}
		});
	});
}

// Build Go backend
function buildCore() {
	return new Promise((resolve, reject) => {
		console.log('📦 Building Go backend (heyvm-core)...');

		// Ensure bin directory exists
		const binDir = join(rootDir, 'bin');
		if (!existsSync(binDir)) {
			mkdirSync(binDir, { recursive: true });
		}

		const coreDir = join(rootDir, 'core');
		const buildProcess = spawn('go', ['build', '-o', '../bin/heyvm-core', './cmd/heyvm-core'], {
			cwd: coreDir,
			stdio: 'inherit',
		});

		buildProcess.on('error', (err) => {
			reject(new Error(`Failed to build Go backend: ${err.message}`));
		});

		buildProcess.on('close', (code) => {
			if (code === 0) {
				console.log('✓ Go backend built successfully\n');
				resolve();
			} else {
				reject(new Error(`Go build failed with exit code ${code}`));
			}
		});
	});
}

// Run installation
async function install() {
	try {
		const hasGo = await checkGo();

		if (!hasGo) {
			console.log('❌ Installation incomplete: Go is required');
			console.log('\nPlease install Go >= 1.21 from https://go.dev/dl/');
			console.log('Then run: npm install -g heyvm\n');
			process.exit(1);
		}

		await buildCore();

		console.log('✅ heyvm installed successfully!');
		console.log('\nRun "heyvm" to start managing your VMs\n');
	} catch (error) {
		console.error('\n❌ Installation failed:', error.message);
		console.error('\nRequirements:');
		console.error('  - Node.js >= 18.0.0');
		console.error('  - Go >= 1.21');
		console.error('\nFor help, visit: https://github.com/adishm/heyvm');
		process.exit(1);
	}
}

install();
