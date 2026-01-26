import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import type { VM, FileInfo } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';
import { parseMouseEvent } from '../../utils/mouseParser.js';

interface FilesTabProps {
	vm: VM;
	isActive: boolean;
}

const VISIBLE_FILES = 15;

export default function FilesTab({ vm, isActive }: FilesTabProps) {
	const [activePane, setActivePane] = useState<'local' | 'remote'>('local');
	const [localPath, setLocalPath] = useState(process.env.HOME || '/');
	const [remotePath, setRemotePath] = useState('/');
	const [localFiles, setLocalFiles] = useState<FileInfo[]>([]);
	const [remoteFiles, setRemoteFiles] = useState<FileInfo[]>([]);
	const [localIndex, setLocalIndex] = useState(0);
	const [remoteIndex, setRemoteIndex] = useState(0);
	const [localScroll, setLocalScroll] = useState(0);
	const [remoteScroll, setRemoteScroll] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [searchMode, setSearchMode] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [transferring, setTransferring] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [transferProgress, setTransferProgress] = useState<{
		file: string;
		direction: string;
		percent: number;
		bytesTransferred: number;
		totalBytes: number;
	} | null>(null);
	const [lastClickState, setLastClickState] = useState<{
		time: number;
		x: number;
		y: number;
		button: number;
		pane: 'local' | 'remote' | null;
		fileIndex: number;
	} | null>(null);
	const [hoveredFile, setHoveredFile] = useState<{
		pane: 'local' | 'remote';
		index: number;
	} | null>(null);

	const navigationThrottle = useRef(Date.now());
	const DOUBLE_CLICK_THRESHOLD = 300; // ms
	const DOUBLE_CLICK_POSITION_TOLERANCE = 2; // characters

	// Load local files
	const loadLocalFiles = useCallback(() => {
		try {
			const entries = fs.readdirSync(localPath, { withFileTypes: true });
			const files: FileInfo[] = [];
			
			// Add parent directory
			if (localPath !== '/') {
				files.push({ name: '..', isDir: true, size: 0, mode: 0o755, modTime: new Date().toISOString() });
			}
			
			for (const entry of entries) {
				if (entry.name.startsWith('.')) continue;
				
				const stats = fs.statSync(path.join(localPath, entry.name));
				files.push({
					name: entry.name,
					isDir: entry.isDirectory(),
					size: stats.size,
					mode: stats.mode,
					modTime: stats.mtime.toISOString(),
				});
			}
			
			setLocalFiles(files);
		} catch (err: any) {
			setError(`Failed to read ${localPath}: ${err.message}`);
		}
	}, [localPath]);

	// Load remote files
	const loadRemoteFiles = useCallback(() => {
		if (vm.status !== 'connected') return;

		ipcClient.listFiles(vm.id, remotePath).then((files) => {
			setRemoteFiles(files);
		}).catch((err) => {
			setError(`Failed to list remote ${remotePath}: ${err.message}`);
		});
	}, [vm.id, vm.status, remotePath]);

	// Throttled navigation
	const canNavigate = useCallback(() => {
		const now = Date.now();
		if (now - navigationThrottle.current < 30) return false;
		navigationThrottle.current = now;
		return true;
	}, []);

	// Scroll up handler for mouse wheel
	const handleScrollUp = useCallback(() => {
		if (!canNavigate()) return;

		const files = activePane === 'local' ? localFiles : remoteFiles;
		const index = activePane === 'local' ? localIndex : remoteIndex;
		const scroll = activePane === 'local' ? localScroll : remoteScroll;

		const newIndex = Math.max(index - 1, 0);

		if (activePane === 'local') {
			setLocalIndex(newIndex);
			if (newIndex < scroll) {
				setLocalScroll(Math.max(scroll - 1, 0));
			}
		} else {
			setRemoteIndex(newIndex);
			if (newIndex < scroll) {
				setRemoteScroll(Math.max(scroll - 1, 0));
			}
		}
	}, [activePane, localFiles, remoteFiles, localIndex, remoteIndex, localScroll, remoteScroll, canNavigate]);

	// Scroll down handler for mouse wheel
	const handleScrollDown = useCallback(() => {
		if (!canNavigate()) return;

		const files = activePane === 'local' ? localFiles : remoteFiles;
		const index = activePane === 'local' ? localIndex : remoteIndex;
		const scroll = activePane === 'local' ? localScroll : remoteScroll;

		const newIndex = Math.min(index + 1, files.length - 1);

		if (activePane === 'local') {
			setLocalIndex(newIndex);
			if (newIndex >= scroll + VISIBLE_FILES) {
				setLocalScroll(scroll + 1);
			}
		} else {
			setRemoteIndex(newIndex);
			if (newIndex >= scroll + VISIBLE_FILES) {
				setRemoteScroll(scroll + 1);
			}
		}
	}, [activePane, localFiles, remoteFiles, localIndex, remoteIndex, localScroll, remoteScroll, canNavigate]);

	// Mouse click helper types and functions
	interface ClickTarget {
		pane: 'local' | 'remote' | null;
		fileIndex: number;      // Absolute index in files array
		visualRow: number;      // Row within visible area (0-14)
		isValid: boolean;       // Whether click is on a valid file
	}

	const mapClickToTarget = useCallback((
		mouseX: number,
		mouseY: number,
		terminalWidth: number
	): ClickTarget => {
		const result: ClickTarget = {
			pane: null,
			fileIndex: -1,
			visualRow: -1,
			isValid: false
		};

		// Calculate layout metrics
		// HEADER_OFFSET accounts for: VM list panel + VM header + tabs + borders
		const HEADER_OFFSET = 20;
		const PANE_HEADER = 1;
		const BORDER_WIDTH = 1;

		const leftPadding = 2;
		const paneWidth = Math.floor((terminalWidth - leftPadding * 2) / 2);
		const localPaneStart = leftPadding + BORDER_WIDTH;
		const localPaneEnd = localPaneStart + paneWidth - BORDER_WIDTH;
		const remotePaneStart = localPaneEnd + BORDER_WIDTH;

		// Determine pane from X coordinate
		if (mouseX >= localPaneStart && mouseX < localPaneEnd) {
			result.pane = 'local';
		} else if (mouseX >= remotePaneStart) {
			result.pane = 'remote';
		} else {
			return result; // Clicked on border or outside
		}

		// Calculate file list Y bounds
		const fileListTop = HEADER_OFFSET + PANE_HEADER + BORDER_WIDTH;
		const fileListBottom = fileListTop + VISIBLE_FILES;

		// Check if click is within file list area
		if (mouseY < fileListTop || mouseY >= fileListBottom) {
			return result; // Clicked on header or outside
		}

		// Calculate file index
		result.visualRow = mouseY - fileListTop;
		const files = result.pane === 'local' ? localFiles : remoteFiles;
		const scroll = result.pane === 'local' ? localScroll : remoteScroll;
		result.fileIndex = scroll + result.visualRow;

		// Validate
		result.isValid = result.fileIndex >= 0 && result.fileIndex < files.length;

		return result;
	}, [localFiles, remoteFiles, localScroll, remoteScroll]);

	const detectClickType = useCallback((
		currentClick: { time: number; x: number; y: number; button: number }
	): 'single' | 'double' => {
		if (!lastClickState) return 'single';

		const timeDelta = currentClick.time - lastClickState.time;
		const positionDelta = Math.abs(currentClick.x - lastClickState.x) +
													Math.abs(currentClick.y - lastClickState.y);

		const isDoubleClick =
			timeDelta < DOUBLE_CLICK_THRESHOLD &&
			positionDelta < DOUBLE_CLICK_POSITION_TOLERANCE &&
			currentClick.button === lastClickState.button;

		return isDoubleClick ? 'double' : 'single';
	}, [lastClickState]);

	const handleSingleClick = useCallback((target: ClickTarget) => {
		// Switch active pane if clicking on inactive pane
		if (target.pane !== activePane) {
			setActivePane(target.pane);
		}

		// Update selection index
		if (target.pane === 'local') {
			setLocalIndex(target.fileIndex);
		} else {
			setRemoteIndex(target.fileIndex);
		}
	}, [activePane]);

	const handleDoubleClick = useCallback((target: ClickTarget) => {
		const files = target.pane === 'local' ? localFiles : remoteFiles;
		const file = files[target.fileIndex];

		// Only navigate if it's a directory
		if (!file || !file.isDir) return;

		// Switch to clicked pane if not already active
		if (target.pane !== activePane) {
			setActivePane(target.pane);
		}

		// Navigate into directory (reuse Enter key logic)
		if (target.pane === 'local') {
			const newPath = file.name === '..'
				? path.dirname(localPath)
				: path.join(localPath, file.name);
			setLocalPath(newPath);
			setLocalIndex(0);
			setLocalScroll(0);
		} else {
			const newPath = file.name === '..'
				? remotePath.split('/').slice(0, -1).join('/') || '/'
				: `${remotePath}/${file.name}`.replace('//', '/');
			setRemotePath(newPath);
			setRemoteIndex(0);
			setRemoteScroll(0);
		}

		// Clear last click state to prevent triple-click issues
		setLastClickState(null);
	}, [activePane, localPath, remotePath, localFiles, remoteFiles]);

	const handleMouseClick = useCallback((mouseEvent: { button: number; x: number; y: number; type: string }) => {
		// Only handle mouse down events
		if (mouseEvent.type !== 'down') return;

		// Throttle clicks
		if (!canNavigate()) return;

		// Ignore clicks during file transfer
		if (transferring) return;

		const termWidth = process.stdout.columns || 120;

		// Map click to target
		const target = mapClickToTarget(
			mouseEvent.x,
			mouseEvent.y,
			termWidth
		);

		// Ignore invalid clicks
		if (!target.isValid || !target.pane) return;

		const currentTime = Date.now();
		const clickType = detectClickType({
			time: currentTime,
			x: mouseEvent.x,
			y: mouseEvent.y,
			button: mouseEvent.button
		});

		// Update last click state
		setLastClickState({
			time: currentTime,
			x: mouseEvent.x,
			y: mouseEvent.y,
			button: mouseEvent.button,
			pane: target.pane,
			fileIndex: target.fileIndex
		});

		// Route to appropriate handler
		if (clickType === 'single') {
			handleSingleClick(target);
		} else {
			handleDoubleClick(target);
		}
	}, [
		transferring,
		canNavigate,
		mapClickToTarget,
		detectClickType,
		handleSingleClick,
		handleDoubleClick
	]);

	const handleMouseMove = useCallback((mouseEvent: { button: number; x: number; y: number; type: string }) => {
		// Ignore if transferring
		if (transferring) {
			setHoveredFile(null);
			return;
		}

		const termWidth = process.stdout.columns || 120;

		// Map mouse position to target
		const target = mapClickToTarget(
			mouseEvent.x,
			mouseEvent.y,
			termWidth
		);

		// Update hover state
		if (target.isValid && target.pane) {
			setHoveredFile({
				pane: target.pane,
				index: target.fileIndex
			});
		} else {
			// Clear hover if mouse is outside file list
			setHoveredFile(null);
		}
	}, [transferring, mapClickToTarget]);

	useEffect(() => {
		if (!isActive) return;
		loadLocalFiles();
	}, [isActive, loadLocalFiles]);

	useEffect(() => {
		if (!isActive || vm.status !== 'connected') return;
		loadRemoteFiles();
	}, [isActive, vm.status, loadRemoteFiles]);

	// Listen for transfer progress events
	useEffect(() => {
		const handleProgress = (data: any) => {
			// Only show progress for this VM's transfers
			if (data.vm_id === vm.id) {
				setTransferProgress({
					file: data.file,
					direction: data.direction,
					percent: data.percent,
					bytesTransferred: data.bytes_transferred,
					totalBytes: data.total_bytes,
				});
			}
		};

		ipcClient.on('TRANSFER_PROGRESS', handleProgress);

		return () => {
			ipcClient.off('TRANSFER_PROGRESS', handleProgress);
		};
	}, [vm.id]);

	// Enable SGR mouse tracking when tab is active
	useEffect(() => {
		if (!isActive) return;

		// Enable SGR extended mouse tracking
		process.stdout.write('\x1b[?1000h'); // Basic mouse tracking
		process.stdout.write('\x1b[?1003h'); // Enable mouse motion tracking
		process.stdout.write('\x1b[?1006h'); // SGR extended format

		return () => {
			// Disable on cleanup
			process.stdout.write('\x1b[?1006l');
			process.stdout.write('\x1b[?1003l');
			process.stdout.write('\x1b[?1000l');
		};
	}, [isActive]);

	// Listen for mouse events on stdin
	useEffect(() => {
		if (!isActive) return;

		const handleData = (data: Buffer) => {
			const mouseEvent = parseMouseEvent(data);

			if (!mouseEvent) return; // Not a mouse event

			// Handle scroll wheel events
			if (mouseEvent.button === 64) {
				// Scroll up - move selection up by 1
				handleScrollUp();
				return;
			} else if (mouseEvent.button === 65) {
				// Scroll down - move selection down by 1
				handleScrollDown();
				return;
			}

			// Handle left click events (button 0)
			if (mouseEvent.button === 0) {
				handleMouseClick(mouseEvent);
				return;
			}

			// Handle mouse motion events (button 32 or 35 for motion without button pressed)
			if (mouseEvent.button === 32 || mouseEvent.button === 35) {
				handleMouseMove(mouseEvent);
			}
		};

		process.stdin.on('data', handleData);

		return () => {
			process.stdin.off('data', handleData);
		};
	}, [isActive, handleScrollUp, handleScrollDown, handleMouseClick, handleMouseMove]);

	useInput((input, key) => {
		if (!isActive) return;
		
		// Handle search mode
		if (searchMode) {
			if (key.escape) {
				setSearchMode(false);
				setSearchQuery('');
			} else if (key.return) {
				// Execute search
				const files = activePane === 'local' ? localFiles : remoteFiles;
				const foundIndex = files.findIndex(f => 
					f.name.toLowerCase().includes(searchQuery.toLowerCase())
				);
				if (foundIndex !== -1) {
					if (activePane === 'local') {
						setLocalIndex(foundIndex);
						setLocalScroll(Math.max(0, foundIndex - Math.floor(VISIBLE_FILES / 2)));
					} else {
						setRemoteIndex(foundIndex);
						setRemoteScroll(Math.max(0, foundIndex - Math.floor(VISIBLE_FILES / 2)));
					}
				}
				setSearchMode(false);
				setSearchQuery('');
			} else if (key.backspace || key.delete) {
				setSearchQuery(searchQuery.slice(0, -1));
			} else if (input && input.length === 1 && !key.ctrl && !key.meta) {
				setSearchQuery(searchQuery + input);
			}
			return;
		}
		
		if (!canNavigate()) return;

		const files = activePane === 'local' ? localFiles : remoteFiles;
		const index = activePane === 'local' ? localIndex : remoteIndex;
		const scroll = activePane === 'local' ? localScroll : remoteScroll;

		// Refresh file list
		if (input === 'r') {
			if (activePane === 'local') {
				loadLocalFiles();
				setStatusMessage('✓ Local files refreshed');
			} else {
				loadRemoteFiles();
				setStatusMessage('✓ Remote files refreshed');
			}
			setTimeout(() => setStatusMessage(null), 1500);
			return;
		}

		// Search mode
		if (input === '/') {
			setSearchMode(true);
			setSearchQuery('');
			return;
		}

		// Push file (local -> remote)
		if (input === 'p') {
			if (activePane === 'local') {
				const file = localFiles[localIndex];
				if (file && !file.isDir && file.name !== '..') {
					setTransferring(true);
					setStatusMessage(`Pushing ${file.name}...`);
					setTransferProgress(null);
					const localFilePath = path.join(localPath, file.name);
					const remoteFilePath = `${remotePath}/${file.name}`.replace('//', '/');
					
					ipcClient.uploadFile(vm.id, localFilePath, remoteFilePath)
						.then(() => {
							setStatusMessage(`✓ Pushed ${file.name}`);
							loadRemoteFiles();
							setTimeout(() => {
								setStatusMessage(null);
								setTransferProgress(null);
							}, 2000);
						})
						.catch((err) => {
							setStatusMessage(`✗ Failed to push: ${err.message}`);
							setTimeout(() => {
								setStatusMessage(null);
								setTransferProgress(null);
							}, 3000);
						})
						.finally(() => setTransferring(false));
				}
			}
			return;
		}

		// Get file (remote -> local)
		if (input === 'g') {
			if (activePane === 'remote') {
				const file = remoteFiles[remoteIndex];
				if (file && !file.isDir && file.name !== '..') {
					setTransferring(true);
					setStatusMessage(`Getting ${file.name}...`);
					setTransferProgress(null);
					const remoteFilePath = `${remotePath}/${file.name}`.replace('//', '/');
					const localFilePath = path.join(localPath, file.name);
					
					ipcClient.downloadFile(vm.id, remoteFilePath, localFilePath)
						.then(() => {
							setStatusMessage(`✓ Got ${file.name}`);
							loadLocalFiles();
							setTimeout(() => {
								setStatusMessage(null);
								setTransferProgress(null);
							}, 2000);
						})
						.catch((err) => {
							setStatusMessage(`✗ Failed to get: ${err.message}`);
							setTimeout(() => {
								setStatusMessage(null);
								setTransferProgress(null);
							}, 3000);
						})
						.finally(() => setTransferring(false));
				}
			}
			return;
		}

		// Navigation
		if (key.downArrow || input === 'j') {
			const newIndex = Math.min(index + 1, files.length - 1);
			if (activePane === 'local') {
				setLocalIndex(newIndex);
				if (newIndex >= scroll + VISIBLE_FILES) {
					setLocalScroll(scroll + 1);
				}
			} else {
				setRemoteIndex(newIndex);
				if (newIndex >= scroll + VISIBLE_FILES) {
					setRemoteScroll(scroll + 1);
				}
			}
		} else if (key.upArrow || input === 'k') {
			const newIndex = Math.max(index - 1, 0);
			if (activePane === 'local') {
				setLocalIndex(newIndex);
				if (newIndex < scroll) {
					setLocalScroll(scroll - 1);
				}
			} else {
				setRemoteIndex(newIndex);
				if (newIndex < scroll) {
					setRemoteScroll(scroll - 1);
				}
			}
		} else if (key.tab) {
			setActivePane(activePane === 'local' ? 'remote' : 'local');
		} else if (key.return) {
			// Enter directory
			const file = files[index];
			if (file?.isDir) {
				if (activePane === 'local') {
					const newPath = file.name === '..' 
						? path.dirname(localPath)
						: path.join(localPath, file.name);
					setLocalPath(newPath);
					setLocalIndex(0);
					setLocalScroll(0);
				} else {
					const newPath = file.name === '..'
						? remotePath.split('/').slice(0, -1).join('/') || '/'
						: `${remotePath}/${file.name}`.replace('//', '/');
					setRemotePath(newPath);
					setRemoteIndex(0);
					setRemoteScroll(0);
				}
			}
		}
	});

	const renderFileList = (files: FileInfo[], selectedIndex: number, scrollOffset: number, pane: 'local' | 'remote') => {
		const visible = files.slice(scrollOffset, scrollOffset + VISIBLE_FILES);
		const isActivPane = activePane === pane;

		return visible.map((file, i) => {
			const actualIndex = scrollOffset + i;
			const isSelected = actualIndex === selectedIndex && isActivPane;
			const isHovered = hoveredFile?.pane === pane && hoveredFile?.index === actualIndex;
			const icon = file.isDir ? '📁' : '📄';
			const prefix = isSelected ? '▶ ' : '  ';

			// Color priority: selected > hovered > default
			let color = undefined;
			let backgroundColor = undefined;
			let inverse = false;
			const paneColor = pane === 'local' ? 'magenta' : 'cyan';

			if (isSelected) {
				color = paneColor;
			} else if (isHovered) {
				color = paneColor;
				inverse = true;
			}

			return (
				<Text key={actualIndex} bold={isSelected} color={color} inverse={inverse}>
					{prefix}{icon} {file.name}
				</Text>
			);
		});
	};

	const renderScrollbar = (
		scrollOffset: number,
		totalFiles: number,
		visibleFiles: number,
		isActive: boolean,
		pane: 'local' | 'remote'
	) => {
		// Don't show scrollbar if all files fit in view
		if (totalFiles <= visibleFiles) {
			return null;
		}

		const scrollableRange = totalFiles - visibleFiles;

		// Calculate thumb size (proportional to visible/total ratio)
		const thumbHeight = Math.max(1, Math.ceil((visibleFiles / totalFiles) * visibleFiles));

		// Calculate thumb position within the track
		const maxThumbPosition = visibleFiles - thumbHeight;
		const thumbPosition = scrollableRange > 0
			? Math.floor((scrollOffset / scrollableRange) * maxThumbPosition)
			: 0;

		// Determine color based on active state
		const color = isActive
			? (pane === 'local' ? 'magenta' : 'cyan')
			: 'gray';

		// Generate scrollbar rows (one per visible file row)
		const scrollbarRows = [];
		for (let i = 0; i < visibleFiles; i++) {
			const isThumb = i >= thumbPosition && i < thumbPosition + thumbHeight;
			scrollbarRows.push(
				<Text key={i} color={color}>
					{isThumb ? '█' : '░'}
				</Text>
			);
		}

		return scrollbarRows;
	};

	const renderProgressBar = (percent: number, width: number = 30) => {
		const filled = Math.round((percent / 100) * width);
		const empty = width - filled;
		return '█'.repeat(filled) + '░'.repeat(empty);
	};

	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	};

	if (vm.status !== 'connected') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">⚠ VM must be connected to browse files</Text>
				<Text dimColor>Connect to the VM first (press 'c' in Overview tab)</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">✗ {error}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" width="100%">
			<Box flexDirection="row" flexGrow={1}>
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor={activePane === 'local' ? 'magenta' : 'gray'}>
					<Text bold color="magenta">Local: {localPath}</Text>
					<Box flexDirection="row">
						<Box flexDirection="column" flexGrow={1}>
							{renderFileList(localFiles, localIndex, localScroll, 'local')}
						</Box>
						{localFiles.length > VISIBLE_FILES && (
							<Box flexDirection="column" width={1}>
								{renderScrollbar(localScroll, localFiles.length, VISIBLE_FILES, activePane === 'local', 'local')}
							</Box>
						)}
					</Box>
				</Box>
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor={activePane === 'remote' ? 'cyan' : 'gray'}>
					<Text bold color="cyan">Remote: {remotePath}</Text>
					<Box flexDirection="row">
						<Box flexDirection="column" flexGrow={1}>
							{renderFileList(remoteFiles, remoteIndex, remoteScroll, 'remote')}
						</Box>
						{remoteFiles.length > VISIBLE_FILES && (
							<Box flexDirection="column" width={1}>
								{renderScrollbar(remoteScroll, remoteFiles.length, VISIBLE_FILES, activePane === 'remote', 'remote')}
							</Box>
						)}
					</Box>
				</Box>
			</Box>
			
			{/* Status bar */}
			{(searchMode || statusMessage || transferring || transferProgress) && (
				<Box marginTop={1} flexDirection="column">
					{searchMode ? (
						<Text>
							<Text color="yellow">Search: </Text>
							<Text>{searchQuery}</Text>
							<Text color="cyan">█</Text>
							<Text dimColor> (Enter to search, Esc to cancel)</Text>
						</Text>
					) : transferProgress ? (
						<Box flexDirection="column">
							<Text>
								<Text color="cyan">{transferProgress.direction === 'upload' ? '↑' : '↓'} </Text>
								<Text>{path.basename(transferProgress.file)}: </Text>
								<Text color="green">{transferProgress.percent.toFixed(1)}%</Text>
								<Text dimColor> ({formatBytes(transferProgress.bytesTransferred)} / {formatBytes(transferProgress.totalBytes)})</Text>
							</Text>
							<Text color="green">{renderProgressBar(transferProgress.percent)}</Text>
						</Box>
					) : transferring ? (
						<Text color="yellow">⏳ {statusMessage}</Text>
					) : statusMessage ? (
						<Text color={statusMessage.startsWith('✓') ? 'green' : 'red'}>{statusMessage}</Text>
					) : null}
				</Box>
			)}
		</Box>
	);
}
