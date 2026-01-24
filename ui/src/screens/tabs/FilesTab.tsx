import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import * as fs from 'fs';
import * as path from 'path';
import type { VM, FileInfo } from '../../core/types.js';
import { useFiles } from '../../hooks/useFiles.js';
import { ipcClient } from '../../core/ipc.js';

interface FilesTabProps {
	vm: VM;
	isActive: boolean;
}

type Pane = 'local' | 'remote';

const FilesTab = React.memo(
	function FilesTab({ vm, isActive }: FilesTabProps) {
	const [activePane, setActivePane] = useState<Pane>('local');
	const [localPath, setLocalPath] = useState(process.env.HOME || '/');
	const [remotePath, setRemotePath] = useState('/');
	const [localFiles, setLocalFiles] = useState<FileInfo[]>([]);
	const [remoteFiles, setRemoteFiles] = useState<FileInfo[]>([]);
	const [localState, setLocalState] = useState({ selectedIndex: 0, scrollOffset: 0 });
	const [remoteState, setRemoteState] = useState({ selectedIndex: 0, scrollOffset: 0 });
	const [searchMode, setSearchMode] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	// Use the useFiles hook for file operations and progress tracking
	const { error, transferring, transferProgress, uploadFile: uploadFileHook, downloadFile: downloadFileHook } = useFiles(vm);

	// Max visible files in each pane (adjust based on terminal height)
	// Accounting for header, status bars, etc., roughly 20 files visible
	const maxVisibleFiles = 20;

	// Load local files
	useEffect(() => {
		loadLocalFiles(localPath);
	}, [localPath]);

	// Load remote files
	useEffect(() => {
		if (vm.status === 'connected') {
			loadRemoteFiles(remotePath);
		}
	}, [remotePath, vm.status]);

	const loadLocalFiles = (dirPath: string) => {
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			const files: FileInfo[] = entries.map(entry => {
				const fullPath = path.join(dirPath, entry.name);
				const stats = fs.statSync(fullPath);
				return {
					name: entry.name,
					size: stats.size,
					mode: stats.mode,
					modTime: stats.mtime.toISOString(),
					isDir: entry.isDirectory()
				};
			});

			// Always add parent directory entry (allows navigation anywhere)
			files.unshift({
				name: '..',
				size: 0,
				mode: 0,
				modTime: new Date().toISOString(),
				isDir: true
			});

			setLocalFiles(files);
			setLocalState({ selectedIndex: 0, scrollOffset: 0 }); // Reset scroll when changing directory
		} catch (err) {
			console.error(`Failed to read local directory: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const loadRemoteFiles = async (dirPath: string) => {
		try {
			const files = await ipcClient.listFiles(vm.id, dirPath);

			// Add parent directory entry if not at root
			if (dirPath !== '/') {
				files.unshift({
					name: '..',
					size: 0,
					mode: 0,
					modTime: new Date().toISOString(),
					isDir: true
				});
			}

			setRemoteFiles(files);
			setRemoteState({ selectedIndex: 0, scrollOffset: 0 }); // Reset scroll when changing directory
		} catch (err) {
			console.error(`Failed to read remote directory: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const handleEnterDirectory = () => {
		if (activePane === 'local') {
			const file = getFilteredLocalFiles[localState.selectedIndex];
			if (file && file.isDir) {
				if (file.name === '..') {
					setLocalPath(path.dirname(localPath));
				} else {
					setLocalPath(path.join(localPath, file.name));
				}
				// Clear search when entering a directory
				setSearchQuery('');
			}
		} else {
			const file = getFilteredRemoteFiles[remoteState.selectedIndex];
			if (file && file.isDir) {
				if (file.name === '..') {
					setRemotePath(path.dirname(remotePath));
				} else {
					setRemotePath(path.join(remotePath, file.name));
				}
				// Clear search when entering a directory
				setSearchQuery('');
			}
		}
	};

	const handlePushFile = async () => {
		const file = getFilteredLocalFiles[localState.selectedIndex];
		if (!file || file.isDir || file.name === '..') return;

		try {
			const localFilePath = path.join(localPath, file.name);
			const remoteFilePath = path.join(remotePath, file.name);

			await uploadFileHook(localFilePath, remoteFilePath);
			await loadRemoteFiles(remotePath);
		} catch (err) {
			// Error is already handled in the hook
			console.error('Upload failed:', err);
		}
	};

	const handleGetFile = async () => {
		const file = getFilteredRemoteFiles[remoteState.selectedIndex];
		if (!file || file.isDir || file.name === '..') return;

		try {
			const remoteFilePath = path.join(remotePath, file.name);
			const localFilePath = path.join(localPath, file.name);

			await downloadFileHook(remoteFilePath, localFilePath);
			loadLocalFiles(localPath);
		} catch (err) {
			// Error is already handled in the hook
			console.error('Download failed:', err);
		}
	};

	// Memoized filter functions
	const getFilteredLocalFiles = useMemo(() => {
		if (!searchQuery || activePane !== 'local') return localFiles;
		return localFiles.filter(file =>
			file.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
	}, [localFiles, searchQuery, activePane]);

	const getFilteredRemoteFiles = useMemo(() => {
		if (!searchQuery || activePane !== 'remote') return remoteFiles;
		return remoteFiles.filter(file =>
			file.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
	}, [remoteFiles, searchQuery, activePane]);

	// Reset selection to top when filter becomes active
	useEffect(() => {
		if (searchQuery) {
			if (activePane === 'local') {
				setLocalState({ selectedIndex: 0, scrollOffset: 0 });
			} else {
				setRemoteState({ selectedIndex: 0, scrollOffset: 0 });
			}
		}
	}, [searchQuery, activePane]);

	// Key handlers
	useInput((input, key) => {
		if (!isActive) return; // Only handle input when active

		// Don't handle keys when in search mode (TextInput handles them)
		if (searchMode) {
			// Use Enter or Esc to exit search input mode (but keep the filter)
			if (key.return || key.escape) {
				setSearchMode(false);
			}
			return;
		}

		if (key.tab) {
			setActivePane(activePane === 'local' ? 'remote' : 'local');
		}

		// Toggle search mode with '/'
		if (input === '/') {
			setSearchMode(true);
			return;
		}

		// Clear filter with 'c'
		if (input === 'c' && searchQuery) {
			setSearchQuery('');
			return;
		}

		// Navigation with auto-scroll
		const currentFiles = activePane === 'local' ? getFilteredLocalFiles : getFilteredRemoteFiles;
		if (input === 'j' || key.downArrow) {
			if (activePane === 'local') {
				const newIndex = Math.min(localState.selectedIndex + 1, currentFiles.length - 1);
				// Auto-scroll down if selection moves below visible area
				const newScrollOffset = newIndex >= localState.scrollOffset + maxVisibleFiles
					? newIndex - maxVisibleFiles + 1
					: localState.scrollOffset;
				setLocalState({ selectedIndex: newIndex, scrollOffset: newScrollOffset });
			} else {
				const newIndex = Math.min(remoteState.selectedIndex + 1, currentFiles.length - 1);
				// Auto-scroll down if selection moves below visible area
				const newScrollOffset = newIndex >= remoteState.scrollOffset + maxVisibleFiles
					? newIndex - maxVisibleFiles + 1
					: remoteState.scrollOffset;
				setRemoteState({ selectedIndex: newIndex, scrollOffset: newScrollOffset });
			}
		}
		if (input === 'k' || key.upArrow) {
			if (activePane === 'local') {
				const newIndex = Math.max(localState.selectedIndex - 1, 0);
				// Auto-scroll up if selection moves above visible area
				const newScrollOffset = newIndex < localState.scrollOffset
					? newIndex
					: localState.scrollOffset;
				setLocalState({ selectedIndex: newIndex, scrollOffset: newScrollOffset });
			} else {
				const newIndex = Math.max(remoteState.selectedIndex - 1, 0);
				// Auto-scroll up if selection moves above visible area
				const newScrollOffset = newIndex < remoteState.scrollOffset
					? newIndex
					: remoteState.scrollOffset;
				setRemoteState({ selectedIndex: newIndex, scrollOffset: newScrollOffset });
			}
		}

		// Actions
		if (key.return) {
			handleEnterDirectory();
		}
		if (input === 'p' && activePane === 'local') {
			handlePushFile();
		}
		if (input === 'g' && activePane === 'remote') {
			handleGetFile();
		}
	});

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return '-';
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
	};

	const renderProgressBar = () => {
		if (!transferProgress) return null;

		const percent = Math.min(100, Math.max(0, transferProgress.percent));
		const barWidth = 40;
		const filledWidth = Math.round((percent / 100) * barWidth);
		const emptyWidth = barWidth - filledWidth;
		const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);

		const direction = transferProgress.direction === 'upload' ? '↑ Uploading' : '↓ Downloading';
		const fileName = path.basename(transferProgress.file);

		return (
			<Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
				<Text color="cyan" bold>{direction}: {fileName}</Text>
				<Box>
					<Text color="green">{bar}</Text>
					<Text> {percent.toFixed(1)}%</Text>
				</Box>
				<Text dimColor>
					{formatFileSize(transferProgress.bytes_transferred)} / {formatFileSize(transferProgress.total_bytes)}
				</Text>
			</Box>
		);
	};

	const renderFileList = (files: FileInfo[], selectedIndex: number, scrollOffset: number, isActive: boolean) => {
		const visibleFiles = files.slice(scrollOffset, scrollOffset + maxVisibleFiles);
		const hasMoreAbove = scrollOffset > 0;
		const hasMoreBelow = scrollOffset + maxVisibleFiles < files.length;
		const filesAbove = scrollOffset;
		const filesBelow = files.length - (scrollOffset + maxVisibleFiles);

		return (
			<>
				{/* Scroll indicator - files above */}
				{hasMoreAbove && (
					<Box marginBottom={0}>
						<Text dimColor>↑ {filesAbove} more above</Text>
					</Box>
				)}

				{/* Visible files */}
				{visibleFiles.map((file, visibleIndex) => {
					const actualIndex = scrollOffset + visibleIndex;
					const isSelected = actualIndex === selectedIndex && isActive;
					return (
						<Box key={`${file.name}-${file.modTime}`}>
							<Text>
								<Text bold color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶ ' : '  '}</Text>
								{file.isDir ? '📁' : '📄'}{' '}
								<Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>{file.name}</Text>
								{'  '}
								<Text dimColor>{formatFileSize(file.size)}</Text>
							</Text>
						</Box>
					);
				})}

				{/* Scroll indicator - files below */}
				{hasMoreBelow && (
					<Box marginTop={0}>
						<Text dimColor>↓ {filesBelow} more below</Text>
					</Box>
				)}
			</>
		);
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

			{/* Progress bar */}
			{transferring && transferProgress && renderProgressBar()}

			{/* Transferring message (when no detailed progress yet) */}
			{transferring && !transferProgress && (
				<Box marginBottom={1}>
					<Text color="yellow">Initializing transfer...</Text>
				</Box>
			)}

			{/* Search bar */}
			{searchMode && (
				<Box marginBottom={1} borderStyle="single" borderColor="cyan" paddingX={1}>
					<Text bold color="cyan">Search: </Text>
					<TextInput
						value={searchQuery}
						onChange={setSearchQuery}
						placeholder="Type to filter files..."
						onSubmit={() => setSearchMode(false)}
					/>
					<Text dimColor> (Enter/Esc to exit)</Text>
				</Box>
			)}

			{/* Dual pane file browser */}
			<Box flexGrow={1}>
				{/* Local pane */}
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor="gray" paddingX={1}>
					<Text bold color={activePane === 'local' ? 'cyan' : 'gray'}>
						{activePane === 'local' ? '▶ ' : '  '}Local: {localPath}
						{searchQuery && activePane === 'local' && <Text dimColor> (filtered: {getFilteredLocalFiles.length}/{localFiles.length})</Text>}
					</Text>
					<Box flexDirection="column" marginTop={1}>
						{renderFileList(getFilteredLocalFiles, localState.selectedIndex, localState.scrollOffset, activePane === 'local')}
					</Box>
				</Box>

				{/* Remote pane */}
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor="gray" paddingX={1}>
					<Text bold color={activePane === 'remote' ? 'cyan' : 'gray'}>
						{activePane === 'remote' ? '▶ ' : '  '}Remote: {remotePath}
						{searchQuery && activePane === 'remote' && <Text dimColor> (filtered: {getFilteredRemoteFiles.length}/{remoteFiles.length})</Text>}
					</Text>
					{vm.status === 'connected' ? (
						<Box flexDirection="column" marginTop={1}>
							{renderFileList(getFilteredRemoteFiles, remoteState.selectedIndex, remoteState.scrollOffset, activePane === 'remote')}
						</Box>
					) : (
						<Box marginTop={1}>
							<Text dimColor>(not connected)</Text>
						</Box>
					)}
				</Box>
			</Box>

			{/* Help text */}
			<Box marginTop={1}>
				<Text dimColor>
					<Text bold>Tab</Text> switch pane • {' '}
					<Text bold>j/k/↑/↓</Text> navigate • {' '}
					<Text bold>Enter</Text> open dir • {' '}
					<Text bold>/</Text> search • {' '}
					{searchQuery && <><Text bold>c</Text> clear filter • {' '}</> }
					<Text bold>p</Text> push (local→remote) • {' '}
					<Text bold>g</Text> get (remote→local)
				</Text>
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

export default FilesTab;
