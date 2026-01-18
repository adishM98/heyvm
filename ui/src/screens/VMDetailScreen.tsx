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
					<Text dimColor>
						<Text bold>c</Text> connect • <Text bold>d</Text> disconnect • <Text bold>1/2/3</Text> tabs • <Text bold>Esc</Text> back
					</Text>
				);
			case 'terminal':
				return (
					<Text dimColor>
						<Text bold>Enter</Text> run • <Text bold>Ctrl+C</Text> interrupt • <Text bold>1/2/3</Text> tabs • <Text bold>Esc</Text> back
					</Text>
				);
			case 'files':
				return (
					<Text dimColor>
						<Text bold>j/k</Text> navigate • <Text bold>Tab</Text> pane • <Text bold>p</Text> push • <Text bold>g</Text> get • <Text bold>/</Text> search • <Text bold>Esc</Text> back
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
				{activeTab === 'overview' && <OverviewTab vm={vm} isActive={isActive} onVMUpdated={onVMUpdated} />}
				{activeTab === 'terminal' && <TerminalTab vm={vm} isActive={isActive} />}
				{activeTab === 'files' && <FilesTab vm={vm} isActive={isActive} />}
			</Box>

			{/* Context-sensitive help bar */}
			<Box borderStyle="single" borderColor="gray" paddingX={1}>
				{getContextHelp()}
			</Box>
		</Box>
	);
});
