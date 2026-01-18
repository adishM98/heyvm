import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VM } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';

interface OverviewTabProps {
	vm: VM;
	isActive: boolean;
	onVMUpdated?: () => Promise<void>;
}

export default React.memo(function OverviewTab({ vm, isActive, onVMUpdated }: OverviewTabProps) {
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConnect = async () => {
		try {
			setConnecting(true);
			setError(null);
			await ipcClient.connectVM(vm.id);

			// Refresh VM status after successful connection
			if (onVMUpdated) {
				await onVMUpdated();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Connection failed');
		} finally {
			setConnecting(false);
		}
	};

	const handleDisconnect = async () => {
		try {
			setError(null);
			await ipcClient.disconnectVM(vm.id);

			// Refresh VM status after successful disconnection
			if (onVMUpdated) {
				await onVMUpdated();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Disconnect failed');
		}
	};

	useInput((input) => {
		if (!isActive) return; // Only handle input when active

		if (input === 'c' && vm.status === 'disconnected') {
			handleConnect();
		}
		if (input === 'd' && vm.status === 'connected') {
			handleDisconnect();
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

	return (
		<Box flexDirection="column">
			{/* Error message */}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			{/* Connecting message */}
			{connecting && (
				<Box marginBottom={1}>
					<Text color="yellow">Connecting...</Text>
				</Box>
			)}

			{/* VM Information */}
			<Box flexDirection="column" marginBottom={2}>
				<Text bold>Connection Details</Text>
				<Box marginTop={1}>
					<Box width={16}>
						<Text dimColor>Host:</Text>
					</Box>
					<Text>{vm.host}:{vm.port}</Text>
				</Box>
				<Box>
					<Box width={16}>
						<Text dimColor>Username:</Text>
					</Box>
					<Text>{vm.username}</Text>
				</Box>
				<Box>
					<Box width={16}>
						<Text dimColor>Auth:</Text>
					</Box>
					<Text dimColor>{vm.auth.type === 'key' ? 'SSH Key' : 'Password'}</Text>
				</Box>
				{vm.auth.type === 'key' && vm.auth.keyPath && (
					<Box>
						<Box width={16}>
							<Text dimColor>Key:</Text>
						</Box>
						<Text dimColor>{vm.auth.keyPath}</Text>
					</Box>
				)}
			</Box>

			{/* Status */}
			<Box flexDirection="column" marginBottom={2}>
				<Text bold>Status</Text>
				<Box marginTop={1}>
					<Box width={16}>
						<Text dimColor>Connection:</Text>
					</Box>
					<Text bold color={getStatusColor(vm.status)}>
						{vm.status.toUpperCase()}
					</Text>
				</Box>
				<Box>
					<Box width={16}>
						<Text dimColor>Last Seen:</Text>
					</Box>
					<Text dimColor>
						{vm.lastSeen ? new Date(vm.lastSeen).toLocaleString() : 'Never'}
					</Text>
				</Box>
			</Box>

			{/* Actions */}
			<Box flexDirection="column">
				<Box>
					{vm.status === 'disconnected' && (
						<Text>
							Press <Text bold color="cyan">c</Text> to connect
						</Text>
					)}
					{vm.status === 'connected' && (
						<Text>
							Press <Text bold color="cyan">d</Text> to disconnect
						</Text>
					)}
				</Box>
			</Box>
		</Box>
	);
});
