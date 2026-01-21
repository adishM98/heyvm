import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import stripAnsi from 'strip-ansi';
import type { VM } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';

interface TerminalTabProps {
	vm: VM;
	isActive: boolean;
}

const MAX_LINES = 500;
const READ_INTERVAL_MS = 200;

const TerminalTab = React.memo(
	function TerminalTab({ vm, isActive }: TerminalTabProps) {
	const [lines, setLines] = useState<string[]>([]);
	const [input, setInput] = useState('');
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(false);
	const readIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const linesBufferRef = useRef<string>('');

	const processOutput = (data: string): string[] => {
		let cleaned = stripAnsi(data);
		cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		linesBufferRef.current += cleaned;
		const newLines = linesBufferRef.current.split('\n');
		linesBufferRef.current = newLines.pop() || '';
		return newLines;
	};

	useEffect(() => {
		if (!isActive || vm.status !== 'connected' || sessionId) return;

		let mounted = true;
		let interval: NodeJS.Timeout | null = null;

		const startSession = async () => {
			try {
				setIsInitializing(true);
				setError(null);
				linesBufferRef.current = '';
				
				const sid = await ipcClient.startPTY(vm.id, 24, 80);
				if (!mounted) return;
				setSessionId(sid);

				try {
					const initialData = await ipcClient.readFromPTY(vm.id, sid, 4096);
					if (initialData && mounted) {
						const newLines = processOutput(initialData);
						setLines(newLines.slice(-MAX_LINES));
					}
				} catch (err) {
					// Ignore
				}

				interval = setInterval(async () => {
					try {
						const data = await ipcClient.readFromPTY(vm.id, sid, 4096);
						if (data && mounted) {
							setLines(prev => {
								const newLines = processOutput(data);
								return [...prev, ...newLines].slice(-MAX_LINES);
							});
						}
					} catch (err) {
						// Ignore
					}
				}, READ_INTERVAL_MS);

				readIntervalRef.current = interval;
			} catch (err) {
				if (mounted) setError(err instanceof Error ? err.message : 'Failed to start terminal session');
			} finally {
				if (mounted) setIsInitializing(false);
			}
		};

		startSession();

		return () => {
			mounted = false;
			if (interval) clearInterval(interval);
			if (readIntervalRef.current) {
				clearInterval(readIntervalRef.current);
				readIntervalRef.current = null;
			}
		};
	}, [isActive, vm.status, vm.id]);

	useEffect(() => {
		return () => {
			if (sessionId) ipcClient.closePTY(vm.id, sessionId).catch(() => {});
		};
	}, [sessionId, vm.id]);

	useInput((input, key) => {
		if (!isActive || !sessionId || vm.status !== 'connected') return;
		if (key.ctrl && input === 'c') sendData('\x03');
	});

	const sendData = async (data: string) => {
		if (!sessionId) return;
		try {
			await ipcClient.writeToPTY(vm.id, sessionId, data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send data');
		}
	};

	const handleSubmit = async () => {
		await sendData(input + '\n');
		setInput('');
	};

	return (
		<Box flexDirection="column" height="100%">
			{vm.status !== 'connected' && (
				<Box marginBottom={1}>
					<Text color="yellow">⚠ Not connected. Switch to Overview tab and connect first.</Text>
				</Box>
			)}
			{isInitializing && (
				<Box marginBottom={1}>
					<Text color="cyan">Initializing terminal session...</Text>
				</Box>
			)}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
			<Box flexDirection="column" flexGrow={1} marginBottom={1} overflow="hidden">
				{lines.map((line, idx) => (
					<Text key={idx}>{line}</Text>
				))}
				{linesBufferRef.current && <Text>{linesBufferRef.current}</Text>}
			</Box>
			{vm.status === 'connected' && sessionId && !isInitializing && (
				<Box>
					<TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Type a command..." />
				</Box>
			)}
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
