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

export default function VMDetailScreen({ vm, activeTab, onTabChange, isActive, onVMUpdated }: VMDetailScreenProps) {
	// Tab state is now controlled by parent (no local state or key handlers)

	return (
		<Box flexDirection="column" padding={1} height="100%">
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{vm.name}
				</Text>
				<Text dimColor> ({vm.host})</Text>
			</Box>

			{/* Tab navigation */}
			<Box marginBottom={1}>
				<Text>
					<Text
						bold={activeTab === 'overview'}
						color={activeTab === 'overview' ? 'cyan' : 'gray'}
					>
						[1] Overview
					</Text>
					{'  '}
					<Text
						bold={activeTab === 'terminal'}
						color={activeTab === 'terminal' ? 'cyan' : 'gray'}
					>
						[2] Terminal
					</Text>
					{'  '}
					<Text
						bold={activeTab === 'files'}
						color={activeTab === 'files' ? 'cyan' : 'gray'}
					>
						[3] Files
					</Text>
				</Text>
			</Box>

			{/* Tab content */}
			<Box flexGrow={1} flexDirection="column">
				{activeTab === 'overview' && <OverviewTab vm={vm} isActive={isActive} onVMUpdated={onVMUpdated} />}
				{activeTab === 'terminal' && <TerminalTab vm={vm} isActive={isActive} />}
				{activeTab === 'files' && <FilesTab vm={vm} isActive={isActive} />}
			</Box>

			{/* Status bar */}
			<Box borderStyle="single" borderColor="gray" paddingX={1}>
				<Text dimColor>
					<Text bold>1/2/3</Text> switch tab • {' '}
					<Text bold>Tab</Text> switch pane • {' '}
					<Text bold>Esc</Text> close
				</Text>
			</Box>
		</Box>
	);
}
