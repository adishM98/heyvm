/**
 * Centralized key bindings configuration for heyvm
 * This defines all keyboard shortcuts used throughout the application
 */

export const KEYBINDINGS = {
	// Global navigation
	global: {
		quit: { keys: ['q'], description: 'quit' },
		back: { keys: ['escape'], description: 'back' },
	},

	// VM List Screen
	vmList: {
		up: { keys: ['k', 'up'], description: 'move up' },
		down: { keys: ['j', 'down'], description: 'move down' },
		select: { keys: ['return'], description: 'select' },
		add: { keys: ['a'], description: 'add VM' },
		delete: { keys: ['d'], description: 'delete' },
		refresh: { keys: ['r'], description: 'refresh' },
	},

	// Add VM Form
	addVM: {
		nextField: { keys: ['return'], description: 'next field' },
		prevField: { keys: ['shift+tab'], description: 'previous field' },
		navigate: { keys: ['up', 'down'], description: 'navigate fields' },
		cancel: { keys: ['escape'], description: 'cancel' },
	},

	// VM Detail Tabs
	vmDetail: {
		tab1: { keys: ['1'], description: 'overview' },
		tab2: { keys: ['2'], description: 'terminal' },
		tab3: { keys: ['3'], description: 'files' },
		back: { keys: ['escape'], description: 'back to list' },
	},

	// Overview Tab
	overview: {
		connect: { keys: ['c'], description: 'connect' },
		disconnect: { keys: ['d'], description: 'disconnect' },
	},

	// Terminal Tab
	terminal: {
		submit: { keys: ['return'], description: 'execute command' },
		clear: { keys: ['ctrl+l'], description: 'clear history' },
	},

	// Files Tab
	files: {
		switchPane: { keys: ['tab'], description: 'switch pane' },
		up: { keys: ['k', 'up'], description: 'move up' },
		down: { keys: ['j', 'down'], description: 'move down' },
		enter: { keys: ['return'], description: 'open directory' },
		push: { keys: ['p'], description: 'push (local→remote)' },
		get: { keys: ['g'], description: 'get (remote→local)' },
		delete: { keys: ['d'], description: 'delete file' },
	},

	// Confirmation Dialog
	confirm: {
		yes: { keys: ['y', 'Y'], description: 'confirm' },
		no: { keys: ['n', 'N', 'escape'], description: 'cancel' },
	},
} as const;

/**
 * Helper function to check if a key matches a binding
 */
export function matchesKey(input: string, key: any, binding: { keys: readonly string[] }): boolean {
	return binding.keys.some(k => {
		if (k === 'return') return key.return;
		if (k === 'escape') return key.escape;
		if (k === 'tab') return key.tab;
		if (k === 'up') return key.upArrow;
		if (k === 'down') return key.downArrow;
		if (k === 'left') return key.leftArrow;
		if (k === 'right') return key.rightArrow;
		return input === k;
	});
}

/**
 * Format key bindings for status bar display
 */
export function formatKeybindings(bindings: Array<{ keys: readonly string[]; description: string }>): Array<{ key: string; description: string }> {
	return bindings.map(binding => ({
		key: binding.keys[0], // Use first key as display
		description: binding.description,
	}));
}
