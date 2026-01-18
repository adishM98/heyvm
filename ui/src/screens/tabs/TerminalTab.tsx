import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { VM } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';

interface TerminalTabProps {
	vm: VM;
	isActive: boolean;
}

const TerminalTab = React.memo(
	function TerminalTab({ vm, isActive }: TerminalTabProps) {
	const [command, setCommand] = useState('');
	const [history, setHistory] = useState<Array<{ command: string; output: string }>>([]);
	const [executing, setExecuting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const executeCommand = async (cmd: string) => {
		if (!cmd.trim()) return;

		try {
			setExecuting(true);
			setError(null);

			const output = await ipcClient.executeCommand(vm.id, cmd);

			setHistory(prev => [...prev, { command: cmd, output }]);
			setCommand('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Command execution failed');
		} finally {
			setExecuting(false);
		}
	};

	const handleSubmit = () => {
		executeCommand(command);
	};

	return (
		<Box flexDirection="column" height="100%">
			{/* Connection check */}
			{vm.status !== 'connected' && (
				<Box marginBottom={1}>
					<Text color="yellow">
						⚠ Not connected. Switch to Overview tab and connect first.
					</Text>
				</Box>
			)}

			{/* Error message */}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			{/* Command history - scrollback of last 20 commands */}
			<Box flexDirection="column" flexGrow={1} marginBottom={1}>
				{history.slice(-20).map((entry, index) => (
					<Box key={`${entry.command}-${index}`} flexDirection="column" marginBottom={1}>
						<Text bold color="cyan">
							$ {entry.command}
						</Text>
						{entry.output && (
							<Text>{entry.output}</Text>
						)}
					</Box>
				))}
			</Box>

			{/* Command input - shell-like prompt */}
			<Box>
				<Text bold color="cyan">$ </Text>
				{vm.status === 'connected' && !executing && (
					<TextInput
						value={command}
						onChange={setCommand}
						onSubmit={handleSubmit}
						placeholder=""
					/>
				)}
				{executing && (
					<Text dimColor>Executing...</Text>
				)}
				{vm.status !== 'connected' && (
					<Text dimColor>(not connected)</Text>
				)}
			</Box>
		</Box>
	);
	},
	(prevProps, nextProps) => {
		return (
			prevProps.isActive === nextProps.isActive &&
			prevProps.vm.id === nextProps.vm.id &&
			prevProps.vm.status === nextProps.vm.status
		);
	}
);

export default TerminalTab;
