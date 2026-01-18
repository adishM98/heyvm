import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VM } from '../core/types.js';
import { ipcClient } from '../core/ipc.js';

interface VMListScreenProps {
	selectedVM: VM | null;
	onSelectVM: (vm: VM) => void;
	isActive: boolean;
	onVMDeleted?: () => void;
	vmListVersion?: number;
}

export default function VMListScreen({ selectedVM, onSelectVM, isActive, onVMDeleted, vmListVersion }: VMListScreenProps) {
	const [vms, setVMs] = useState<VM[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load VMs on mount and when vmListVersion changes
	useEffect(() => {
		loadVMs();
	}, [vmListVersion]);

	const loadVMs = async () => {
		try {
			setLoading(true);
			setError(null);
			const vmList = await ipcClient.listVMs();
			setVMs(vmList);

			// Reset selection if out of bounds
			if (selectedIndex >= vmList.length && vmList.length > 0) {
				setSelectedIndex(vmList.length - 1);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load VMs');
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteVM = async () => {
		if (vms.length === 0) return;

		const vm = vms[selectedIndex];
		if (!vm) return;

		// Don't allow deleting the currently selected VM (safety measure)
		if (selectedVM?.id === vm.id) {
			setError('Cannot delete VM while it is selected. Press Esc to deselect first.');
			return;
		}

		try {
			await ipcClient.removeVM(vm.id);
			await loadVMs();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete VM');
		}
	};

	// Key handlers
	useInput((input, key) => {
		if (!isActive) return; // Only handle input when active

		// Navigation
		if (input === 'j' || key.downArrow) {
			setSelectedIndex(prev => Math.min(prev + 1, vms.length - 1));
		}
		if (input === 'k' || key.upArrow) {
			setSelectedIndex(prev => Math.max(prev - 1, 0));
		}

		// Actions
		if (key.return && vms.length > 0) {
			onSelectVM(vms[selectedIndex]);
		}
		if (input === 'd' && vms.length > 0) {
			handleDeleteVM();
		}
		if (input === 'r') {
			loadVMs();
		}
	});

	const getStatusColor = (status: VM['status']): string => {
		switch (status) {
			case 'connected':
				return 'green';
			case 'disconnected':
				return 'gray';
			case 'connecting':
				return 'yellow';
			case 'error':
				return 'red';
			default:
				return 'gray';
		}
	};

	const getStatusSymbol = (status: VM['status']): string => {
		switch (status) {
			case 'connected':
				return '●';
			case 'disconnected':
				return '○';
			case 'connecting':
				return '◐';
			case 'error':
				return '✕';
			default:
				return '?';
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold color="cyan">
					VMs ({vms.length})
				</Text>
			</Box>

			{/* Loading state */}
			{loading && (
				<Box>
					<Text>Loading VMs...</Text>
				</Box>
			)}

			{/* Error state */}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			{/* Empty state */}
			{!loading && !error && vms.length === 0 && (
				<Box flexDirection="column" marginBottom={1}>
					<Text dimColor>No VMs configured yet.</Text>
					<Text dimColor>Press 'a' to add your first VM.</Text>
				</Box>
			)}

			{/* VM list */}
			{!loading && vms.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					{vms.map((vm, index) => {
						const isCursor = index === selectedIndex;
						const isSelected = selectedVM?.id === vm.id;
						return (
							<Box key={vm.id} marginBottom={0}>
								<Text>
									{isCursor ? '>' : ' '}{' '}
									<Text color={isSelected ? 'cyan' : getStatusColor(vm.status)}>
										{getStatusSymbol(vm.status)}
									</Text>{' '}
									<Text bold={isCursor || isSelected}>{vm.name}</Text>{' '}
									<Text dimColor>
										({vm.username}@{vm.host}:{vm.port})
									</Text>{' '}
									<Text dimColor>
										[{vm.auth.type === 'key' ? 'SSH Key' : 'Password'}]
									</Text>
								</Text>
							</Box>
						);
					})}
				</Box>
			)}

			{/* Status bar */}
			<Box borderStyle="single" borderColor="gray" paddingX={1}>
				<Text dimColor>
					<Text bold>j/k</Text> navigate • {' '}
					<Text bold>Enter</Text> select • {' '}
					<Text bold>a</Text> add • {' '}
					{!selectedVM && <><Text bold>d</Text> delete • {' '}</>}
					<Text bold>r</Text> refresh
				</Text>
			</Box>
		</Box>
	);
}
