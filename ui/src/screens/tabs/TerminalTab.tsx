import React, { useState, useEffect, useRef, useReducer } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VM } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';
import { TerminalEmulator } from '../../utils/terminalEmulator.js';

interface TerminalTabProps {
	vm: VM;
	isActive: boolean;
}

const TERMINAL_ROWS = 24;
const TERMINAL_COLS = 80;

const TerminalTab = React.memo(
	function TerminalTab({ vm, isActive }: TerminalTabProps) {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const ptyStartedRef = useRef<boolean>(false);
	const emulatorRef = useRef<TerminalEmulator | null>(null);
	
	// Imperative rendering: use forceUpdate instead of state
	const [, forceUpdate] = useReducer(x => x + 1, 0);
	const dirtyRef = useRef<boolean>(false);
	const rafIdRef = useRef<NodeJS.Timeout | null>(null);
	
	// Cursor blinking
	const [cursorVisible, setCursorVisible] = useState(true);
	const cursorIntervalRef = useRef<NodeJS.Timeout | null>(null);

	// Initialize terminal emulator
	useEffect(() => {
		emulatorRef.current = new TerminalEmulator(TERMINAL_ROWS, TERMINAL_COLS);

		return () => {
			if (rafIdRef.current !== null) {
				clearTimeout(rafIdRef.current);
				rafIdRef.current = null;
			}
			if (cursorIntervalRef.current) {
				clearInterval(cursorIntervalRef.current);
				cursorIntervalRef.current = null;
			}
			if (emulatorRef.current) {
				emulatorRef.current.dispose();
				emulatorRef.current = null;
			}
		};
	}, []);

	// Cursor blinking effect
	useEffect(() => {
		if (!sessionId || !isActive) {
			if (cursorIntervalRef.current) {
				clearInterval(cursorIntervalRef.current);
				cursorIntervalRef.current = null;
			}
			return;
		}

		// Blink cursor every 500ms
		cursorIntervalRef.current = setInterval(() => {
			setCursorVisible(v => !v);
		}, 500);

		return () => {
			if (cursorIntervalRef.current) {
				clearInterval(cursorIntervalRef.current);
				cursorIntervalRef.current = null;
			}
		};
	}, [sessionId, isActive]);

	// Start PTY session once per VM connection (NOT tied to render lifecycle)
	useEffect(() => {
		if (!isActive) return;
		if (vm.status !== 'connected') return;
		if (ptyStartedRef.current) return;

		console.log('[Terminal] Starting PTY session...');
		ptyStartedRef.current = true;
		
		// Listen for PTY_READY event
		const handleReady = ({ session_id, vm_id }: any) => {
			if (vm_id === vm.id) {
				console.log('[Terminal] PTY ready:', session_id);
				setSessionId(session_id);
			}
		};

		const handleError = ({ vm_id, error: errorMsg }: any) => {
			if (vm_id === vm.id) {
				console.error('[Terminal] PTY error:', errorMsg);
				setError(errorMsg);
			}
		};

		ipcClient.on('PTY_READY', handleReady);
		ipcClient.on('PTY_ERROR', handleError);

		// Send PTY_START message (fire-and-forget)
		ipcClient.startPTY(vm.id, 24, 80);

		// Cleanup only removes event listeners, does NOT close PTY
		return () => {
			ipcClient.off('PTY_READY', handleReady);
			ipcClient.off('PTY_ERROR', handleError);
		};
	}, [isActive, vm.status, vm.id]); // sessionId NOT in deps!

	// Listen for PTY output events - imperative rendering
	useEffect(() => {
		if (!sessionId) return;

		const scheduleUpdate = () => {
			if (dirtyRef.current) return; // Already scheduled
			
			dirtyRef.current = true;
			rafIdRef.current = setTimeout(() => {
				dirtyRef.current = false;
				rafIdRef.current = null;
				forceUpdate(); // Trigger re-render of viewport
			}, 16); // ~60fps (16ms)
		};

		const handleOutput = ({ session_id, data }: any) => {
			if (session_id !== sessionId) return;
			
			// Decode base64 PTY output
			const decoded = Buffer.from(data, 'base64').toString('utf-8');
			
			// Feed to emulator which processes ANSI escape sequences
			// Terminal emulator owns the state, not React
			if (emulatorRef.current) {
				emulatorRef.current.write(decoded);
				scheduleUpdate(); // Throttled re-render at ~60fps
			}
		};

		const handleExit = ({ session_id }: any) => {
			if (session_id === sessionId) {
				console.log('[Terminal] PTY exited');
				setSessionId(null);
				setError('Terminal session closed');
			}
		};

		ipcClient.on('PTY_OUTPUT', handleOutput);
		ipcClient.on('PTY_EXIT', handleExit);

		return () => {
			ipcClient.off('PTY_OUTPUT', handleOutput);
			ipcClient.off('PTY_EXIT', handleExit);
			if (rafIdRef.current !== null) {
				clearTimeout(rafIdRef.current);
				rafIdRef.current = null;
			}
		};
	}, [sessionId]);

	// Handle terminal resize
	useEffect(() => {
		if (!sessionId || !isActive) return;

		const handleResize = () => {
			const rows = process.stdout.rows || TERMINAL_ROWS;
			const cols = process.stdout.columns || TERMINAL_COLS;
			
			// Resize emulator
			if (emulatorRef.current) {
				emulatorRef.current.resize(rows, cols);
				forceUpdate(); // Re-render with new dimensions
			}
			
			// Notify backend
			ipcClient.resizePTY(vm.id, sessionId, rows, cols);
		};

		process.stdout.on('resize', handleResize);
		return () => {
			process.stdout.off('resize', handleResize);
		};
	}, [sessionId, isActive, vm.id]);

	// Close PTY only on VM disconnect or status change (NOT on tab switch)
	useEffect(() => {
		if (vm.status === 'disconnected' && sessionId) {
			console.log('[Terminal] VM disconnected, closing PTY');
			ipcClient.closePTY(vm.id, sessionId);
			ptyStartedRef.current = false;
			setSessionId(null);
		}
	}, [vm.status, sessionId, vm.id]);

	// Handle raw input - send directly to PTY with proper escape sequences
	useInput((input, key) => {
		if (!isActive || !sessionId || vm.status !== 'connected') return;
		
		// Handle control keys
		if (key.ctrl && input === 'c') return ipcClient.writeToPTY(vm.id, sessionId, '\x03');
		if (key.ctrl && input === 'd') return ipcClient.writeToPTY(vm.id, sessionId, '\x04');
		if (key.ctrl && input === 'z') return ipcClient.writeToPTY(vm.id, sessionId, '\x1a');
		
		// Handle special keys
		if (key.return) return ipcClient.writeToPTY(vm.id, sessionId, '\n');
		if (key.backspace || key.delete) return ipcClient.writeToPTY(vm.id, sessionId, '\x7f');
		if (key.tab) return ipcClient.writeToPTY(vm.id, sessionId, '\t');
		
		// Handle arrow keys with ANSI escape sequences
		if (key.upArrow) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[A');
		if (key.downArrow) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[B');
		if (key.leftArrow) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[D');
		if (key.rightArrow) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[C');
		
		// Send regular character input
		if (input) {
			ipcClient.writeToPTY(vm.id, sessionId, input);
		}
	});

	return (
		<Box flexDirection="column" height="100%">
			{vm.status !== 'connected' && (
				<Box marginBottom={1}>
					<Text color="yellow">⚠ Not connected. Switch to Overview tab and connect first.</Text>
				</Box>
			)}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
			{vm.status === 'connected' && emulatorRef.current && (
				<Box flexDirection="column" height={TERMINAL_ROWS} overflow="hidden">
					{emulatorRef.current.getViewport(TERMINAL_ROWS).map((line, i) => {
						const cursor = emulatorRef.current?.getCursorPosition();
						const buffer = emulatorRef.current?.getTerminal().buffer.active;
						const viewportY = buffer?.viewportY || 0;
						const cursorRow = cursor ? cursor.y : 0;
						const cursorCol = cursor ? cursor.x : 0;
						const isOnThisLine = cursorRow - viewportY === i;
						
						if (isOnThisLine && cursorVisible && sessionId) {
							// Insert cursor at the correct position
							const beforeCursor = line.substring(0, cursorCol);
							const atCursor = line[cursorCol] || ' ';
							const afterCursor = line.substring(cursorCol + 1);
							
							return (
								<Text key={i}>
									{beforeCursor}
									<Text inverse>{atCursor}</Text>
									{afterCursor}
								</Text>
							);
						}
						
						return <Text key={i}>{line || ' '}</Text>;
					})}
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
