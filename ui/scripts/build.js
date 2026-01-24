#!/usr/bin/env node

/**
 * Build script for heyvm UI
 * Supports two modes:
 * - dev: Keep npm packages external (use node_modules)
 * - prod: Bundle npm packages (for global npm install)
 */

import { build } from 'esbuild';
import { builtinModules } from 'module';
import { createRequire } from 'module';

// Check if this is a production build
const isProd = process.argv.includes('--prod');

// Node.js built-in modules to keep external
const nodeExternals = builtinModules.flatMap(mod => [mod, `node:${mod}`]);

// For dev builds, also keep npm packages external (bundle xterm due to ESM/CJS issues)
const external = isProd
	? nodeExternals
	: [...nodeExternals, 'react', 'ink', 'ink-select-input', 'ink-text-input'];

// Banner to inject require() for ESM compatibility with dynamic requires
const requirePolyfill = `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
`;

async function buildUI() {
	try {
		console.log(`Building in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode...`);

		await build({
			entryPoints: ['src/index.tsx'],
			bundle: true,
			platform: 'node',
			format: 'esm',
			outfile: 'dist/index.js',
			external,
			banner: { js: requirePolyfill },
			logLevel: 'info',
		});
		console.log('✓ Build complete');
	} catch (error) {
		console.error('✗ Build failed:', error);
		process.exit(1);
	}
}

buildUI();
