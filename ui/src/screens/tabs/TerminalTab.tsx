import React, { useState, useEffect, useRef, useReducer } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VM } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';
import { TerminalEmulator } from '../../utils/terminalEmulator.js';

interface TerminalTabProps {
	vm: VM;
	isActive: boolean;
}

const TERMINAL_ROWS = 24; // Fixed height to prevent layout issues

const TerminalTab = React.memo(
	function TerminalTab({ vm, isActive }: TerminalTabProps) {
	// Get terminal dimensions - fixed rows, dynamic columns
	const getTerminalDimensions = () => ({
		rows: TERMINAL_ROWS,
		cols: process.stdout.columns || 120
	});

	const [sessionId, setSessionId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [scrollOffset, setScrollOffset] = useState(0); // 0 = bottom (live), positive = scrolled up
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
		const dims = getTerminalDimensions();
		emulatorRef.current = new TerminalEmulator(dims.rows, dims.cols);

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

		ptyStartedRef.current = true;
		
		// Listen for PTY_READY event
		const handleReady = ({ session_id, vm_id }: any) => {
			if (vm_id === vm.id) {
				setSessionId(session_id);
			}
		};

		const handleError = ({ vm_id, error: errorMsg }: any) => {
			if (vm_id === vm.id) {
				setError(errorMsg);
			}
		};

		ipcClient.on('PTY_READY', handleReady);
		ipcClient.on('PTY_ERROR', handleError);

		// Send PTY_START message with actual terminal dimensions
		const dims = getTerminalDimensions();
		ipcClient.startPTY(vm.id, dims.rows, dims.cols);

		// Cleanup only removes event listeners, does NOT close PTY
		return () => {
			ipcClient.off('PTY_READY', handleReady);
			ipcClient.off('PTY_ERROR', handleError);
		};
	}, [isActive, vm.status, vm.id]); // sessionId NOT in deps!

	// Listen for PTY output events - imperative rendering with batching
	useEffect(() => {
		if (!sessionId) return;

		let writeBuffer = '';
		let writeTimeoutId: NodeJS.Timeout | null = null;

		const flushWrites = () => {
			if (writeBuffer && emulatorRef.current) {
				emulatorRef.current.write(writeBuffer);
				writeBuffer = '';
				
				// Schedule single render update
				if (!dirtyRef.current) {
					dirtyRef.current = true;
					rafIdRef.current = setTimeout(() => {
						dirtyRef.current = false;
						rafIdRef.current = null;
						forceUpdate();
					}, 16);
				}
			}
			writeTimeoutId = null;
		};

		const handleOutput = ({ session_id, data }: any) => {
			if (session_id !== sessionId) return;
			
			// Decode base64 PTY output
			const decoded = Buffer.from(data, 'base64').toString('utf-8');
			
			// Batch writes for better performance
			writeBuffer += decoded;
			
			// Debounce flush - wait for more data or 4ms max
			if (writeTimeoutId) clearTimeout(writeTimeoutId);
			writeTimeoutId = setTimeout(flushWrites, 4);
		};

		const handleExit = ({ session_id }: any) => {
			if (session_id === sessionId) {
				setSessionId(null);
				setError('Terminal session closed');
			}
		};

		ipcClient.on('PTY_OUTPUT', handleOutput);
		ipcClient.on('PTY_EXIT', handleExit);

		return () => {
			// Flush any pending writes before cleanup
			if (writeTimeoutId) {
				clearTimeout(writeTimeoutId);
				flushWrites();
			}
			
			ipcClient.off('PTY_OUTPUT', handleOutput);
			ipcClient.off('PTY_EXIT', handleExit);
			if (rafIdRef.current !== null) {
				clearTimeout(rafIdRef.current);
				rafIdRef.current = null;
			}
		};
	}, [sessionId]);

	// Handle terminal resize (width only - height is fixed)
	useEffect(() => {
		if (!sessionId || !isActive) return;

		const handleResize = () => {
			const dims = getTerminalDimensions();

			// Resize emulator
			if (emulatorRef.current) {
				emulatorRef.current.resize(dims.rows, dims.cols);
				forceUpdate(); // Re-render with new dimensions
			}

			// Notify backend
			ipcClient.resizePTY(vm.id, sessionId, dims.rows, dims.cols);
		};

		process.stdout.on('resize', handleResize);
		return () => {
			process.stdout.off('resize', handleResize);
		};
	}, [sessionId, isActive, vm.id]);

	// Close PTY only on VM disconnect or status change (NOT on tab switch)
	useEffect(() => {
		if (vm.status === 'disconnected' && sessionId) {
			ipcClient.closePTY(vm.id, sessionId);
			ptyStartedRef.current = false;
			setSessionId(null);
		}
	}, [vm.status, sessionId, vm.id]);

	// Handle all keyboard input - terminal takes COMPLETE control when active
	// Only Ctrl+O can exit the terminal tab, everything else goes to the PTY
	useInput((input, key) => {
		if (!isActive || !sessionId || vm.status !== 'connected') return;
		
		// Ctrl+O: ONLY exit command - switch to Overview tab (let parent handle it)
		if (key.ctrl && input === 'o') {
			// Don't capture - let it bubble to parent App.tsx
			return;
		}
		
		// Scroll handling (intercept before sending to PTY)
		if (key.pageUp) {
			setScrollOffset(prev => Math.min(prev + TERMINAL_ROWS, 1000)); // Scroll up
			return;
		}
		if (key.pageDown) {
			if (scrollOffset > 0) {
				setScrollOffset(prev => Math.max(prev - TERMINAL_ROWS, 0)); // Scroll down
				return;
			}
			// If already at bottom, send to PTY
		}
		
		// Shift+Up/Down for line-by-line scrolling
		if (key.shift && key.upArrow) {
			setScrollOffset(prev => Math.min(prev + 1, 1000));
			return;
		}
		if (key.shift && key.downArrow) {
			if (scrollOffset > 0) {
				setScrollOffset(prev => Math.max(prev - 1, 0));
				return;
			}
		}
		
		// Any other key: auto-scroll to bottom (resume live mode)
		if (scrollOffset > 0 && (input || key.return || key.backspace)) {
			setScrollOffset(0);
		}
		
		// Escape key (critical for vim)
		if (key.escape) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b');
		
		// Ctrl+key combinations (MUST be handled BEFORE any other input processing)
		// These are sent to the terminal, NOT to the app (terminal is locked)
		if (key.ctrl) {
			// Ctrl+C: Send interrupt signal to terminal (NOT app quit!)
			if (input === 'c') {
				return ipcClient.writeToPTY(vm.id, sessionId, '\x03');
			}
			
			// Ctrl+D: Send EOF signal
			if (input === 'd') {
				return ipcClient.writeToPTY(vm.id, sessionId, '\x04');
			}
			
			// Ctrl+Z: Send suspend signal
			if (input === 'z') {
				return ipcClient.writeToPTY(vm.id, sessionId, '\x1a');
			}
			
			// Other Ctrl+key combinations
			if (input) {
				const char = input.toLowerCase();
				if (char >= 'a' && char <= 'z') {
					const code = char.charCodeAt(0) - 96; // Ctrl+A = 1, Ctrl+B = 2, etc
					return ipcClient.writeToPTY(vm.id, sessionId, String.fromCharCode(code));
				}
			}
		}
		
		// Special keys
		if (key.return) return ipcClient.writeToPTY(vm.id, sessionId, '\r');
		if (key.backspace || key.delete) return ipcClient.writeToPTY(vm.id, sessionId, '\x7f');
		if (key.tab) return ipcClient.writeToPTY(vm.id, sessionId, '\t');
		
		// Arrow keys (without shift - send to PTY)
		if (key.upArrow && !key.shift) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[A');
		if (key.downArrow && !key.shift) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[B');
		if (key.leftArrow) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[D');
		if (key.rightArrow) return ipcClient.writeToPTY(vm.id, sessionId, '\x1b[C');
		
		// Regular characters (including space, numbers, symbols, etc.)
		// This handles all printable characters
		if (input) {
			return ipcClient.writeToPTY(vm.id, sessionId, input);
		}
	}, { isActive });

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
				<Box flexDirection="column">
					{/* Scroll indicator */}
					{scrollOffset > 0 && (
						<Box>
							<Text color="yellow" dimColor>
								↑ Scrolled {scrollOffset} lines | PgUp/PgDn or Shift+↑↓ to scroll | Type to resume
							</Text>
						</Box>
					)}
					
					{/* Terminal viewport */}
					<Box flexDirection="column" height={TERMINAL_ROWS} overflow="hidden">
						{(() => {
							// Cache cursor position and viewport for all rows (performance optimization)
							const cursor = emulatorRef.current?.getCursorPosition();
							const buffer = emulatorRef.current?.getTerminal().buffer.active;
							const viewportY = buffer?.viewportY || 0;
							const cursorRow = cursor ? cursor.y : 0;
							const cursorCol = cursor ? cursor.x : 0;
							const showCursor = scrollOffset === 0 && sessionId && cursorVisible;

							return emulatorRef.current.getViewport(TERMINAL_ROWS, scrollOffset).map((line, i) => {
								const isOnThisLine = showCursor && (cursorRow - viewportY === i);
								
								if (isOnThisLine) {
									// Render cursor - optimized string operations
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
							});
						})()}
					</Box>
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
