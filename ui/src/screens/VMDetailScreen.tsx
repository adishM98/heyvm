import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VM, Tab } from '../core/types.js';
import OverviewTab from './tabs/OverviewTab.js';
import TerminalTab from './tabs/TerminalTab.js';
import FilesTab from './tabs/FilesTab.js';

interface VMDetailScreenProps {
	vm: VM;
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
	isActive: boolean;
	onVMUpdated?: () => Promise<void>;
}

export default React.memo(function VMDetailScreen({ vm, activeTab, onTabChange, isActive, onVMUpdated }: VMDetailScreenProps) {
	// Tab state is now controlled by parent (no local state or key handlers)

	// Calculate header offset for mouse coordinate mapping in FilesTab
	// With full-screen alternate buffer mode, coordinates always start at (0,0)
	// This offset is now a simple count of UI elements above the file list:
	// - padding(1) empty line
	// - header line 1: "● VM_NAME  STATUS"
	// - header line 2: "  user@host"
	// - marginTop(1) before separator
	// - separator line: "────────"
	// - marginBottom(1) after header box
	// - tabs line: "Overview | Terminal | Files"
	// - marginBottom(1) after tabs
	// Total: 9 lines before FilesTab content starts
	const filesTabHeaderOffset = 9;

	const getStatusColor = () => {
		if (vm.status === 'connected') return 'green';
		if (vm.status === 'connecting') return 'yellow';
		return 'gray';
	};

	const getStatusText = () => {
		if (vm.status === 'connected') return 'CONNECTED';
		if (vm.status === 'connecting') return 'CONNECTING';
		return 'DISCONNECTED';
	};

	const getContextHelp = () => {
		switch (activeTab) {
			case 'overview':
				return (
					<Text>
						<Text bold color="cyan">c</Text> <Text color="green">connect</Text> • <Text bold color="cyan">d</Text> <Text color="green">disconnect</Text> • <Text bold color="cyan">1/2/3</Text> <Text color="green">tabs</Text> • <Text bold color="cyan">Esc</Text> <Text color="green">back</Text>
					</Text>
				);
			case 'terminal':
				return (
					<Text>
						<Text bold color="cyan">PgUp/PgDn</Text> or <Text bold color="cyan">Shift+↑↓</Text> <Text color="green">scroll</Text> • <Text bold color="cyan">Ctrl+O</Text> <Text color="green">exit terminal</Text> • <Text bold color="cyan">Esc</Text> <Text color="green">back</Text>
					</Text>
				);
			case 'files':
				return (
					<Text>
						<Text bold color="cyan">j/k</Text> <Text color="green">navigate</Text> • <Text bold color="cyan">Tab</Text> <Text color="green">pane</Text> • <Text bold color="cyan">p</Text> <Text color="green">push</Text> • <Text bold color="cyan">g</Text> <Text color="green">get</Text> • <Text bold color="cyan">/</Text> <Text color="green">search</Text> • <Text bold color="cyan">r</Text> <Text color="green">refresh</Text> • <Text bold color="cyan">Esc</Text> <Text color="green">back</Text>
					</Text>
				);
			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" padding={1} height="100%">
			{/* Header - Strong visual hierarchy */}
			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text bold color="cyan">{vm.status === 'connected' ? '● ' : vm.status === 'connecting' ? '◐ ' : '○ '}</Text>
					<Text bold>{vm.name}</Text>
					<Text>{'  '}</Text>
					<Text bold color={getStatusColor()}>{getStatusText()}</Text>
				</Box>
				<Box>
					<Text dimColor>  {vm.username}@{vm.host}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>{'─'.repeat(60)}</Text>
				</Box>
			</Box>

			{/* Tab navigation - feels like real tabs */}
			<Box marginBottom={1}>
				<Text>
					<Text
						bold={activeTab === 'overview'}
						color={activeTab === 'overview' ? 'cyan' : 'gray'}
					>
						Overview
					</Text>
					<Text dimColor> {activeTab === 'overview' ? '▶' : '|'} </Text>
					<Text
						bold={activeTab === 'terminal'}
						color={activeTab === 'terminal' ? 'cyan' : 'gray'}
					>
						Terminal
					</Text>
					<Text dimColor> {activeTab === 'terminal' ? '▶' : '|'} </Text>
					<Text
						bold={activeTab === 'files'}
						color={activeTab === 'files' ? 'cyan' : 'gray'}
					>
						Files
					</Text>
				</Text>
			</Box>

			{/* Tab content */}
			<Box flexGrow={1} flexDirection="column">
				{activeTab === 'overview' ? (
					<OverviewTab vm={vm} isActive={isActive} onVMUpdated={onVMUpdated} />
				) : activeTab === 'terminal' ? (
					<TerminalTab vm={vm} isActive={isActive} />
				) : (
					<FilesTab vm={vm} isActive={isActive} headerOffset={filesTabHeaderOffset} />
				)}
			</Box>

			{/* Context-sensitive help bar */}
			<Box borderStyle="single" borderColor="gray" paddingX={1}>
				{getContextHelp()}
			</Box>
		</Box>
	);
}, (prevProps, nextProps) => {
	// Only re-render if these critical props change
	return (
		prevProps.activeTab === nextProps.activeTab &&
		prevProps.isActive === nextProps.isActive &&
		prevProps.vm.id === nextProps.vm.id &&
		prevProps.vm.status === nextProps.vm.status &&
		prevProps.vm.name === nextProps.vm.name
	);
});
