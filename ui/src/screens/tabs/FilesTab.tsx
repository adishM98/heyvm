import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import * as fs from 'fs';
import * as path from 'path';
import type { VM, FileInfo } from '../../core/types.js';
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
	const [localSelectedIndex, setLocalSelectedIndex] = useState(0);
	const [remoteSelectedIndex, setRemoteSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [transferring, setTransferring] = useState(false);
	const [searchMode, setSearchMode] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [localScrollOffset, setLocalScrollOffset] = useState(0);
	const [remoteScrollOffset, setRemoteScrollOffset] = useState(0);

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
			setLocalSelectedIndex(0);
			setLocalScrollOffset(0); // Reset scroll when changing directory
		} catch (err) {
			setError(`Failed to read local directory: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const loadRemoteFiles = async (dirPath: string) => {
		try {
			setError(null);
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
			setRemoteSelectedIndex(0);
			setRemoteScrollOffset(0); // Reset scroll when changing directory
		} catch (err) {
			setError(`Failed to read remote directory: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const handleEnterDirectory = () => {
		if (activePane === 'local') {
			const file = localFiles[localSelectedIndex];
			if (file && file.isDir) {
				if (file.name === '..') {
					setLocalPath(path.dirname(localPath));
				} else {
					setLocalPath(path.join(localPath, file.name));
				}
			}
		} else {
			const file = remoteFiles[remoteSelectedIndex];
			if (file && file.isDir) {
				if (file.name === '..') {
					setRemotePath(path.dirname(remotePath));
				} else {
					setRemotePath(path.join(remotePath, file.name));
				}
			}
		}
	};

	const handlePushFile = async () => {
		const file = localFiles[localSelectedIndex];
		if (!file || file.isDir || file.name === '..') return;

		try {
			setTransferring(true);
			setError(null);

			const localFilePath = path.join(localPath, file.name);
			const remoteFilePath = path.join(remotePath, file.name);

			await ipcClient.uploadFile(vm.id, localFilePath, remoteFilePath);
			await loadRemoteFiles(remotePath);
		} catch (err) {
			setError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setTransferring(false);
		}
	};

	const handleGetFile = async () => {
		const file = remoteFiles[remoteSelectedIndex];
		if (!file || file.isDir || file.name === '..') return;

		try {
			setTransferring(true);
			setError(null);

			const remoteFilePath = path.join(remotePath, file.name);
			const localFilePath = path.join(localPath, file.name);

			await ipcClient.downloadFile(vm.id, remoteFilePath, localFilePath);
			loadLocalFiles(localPath);
		} catch (err) {
			setError(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setTransferring(false);
		}
	};

	// Filter files based on search query
	const filterFiles = (files: FileInfo[]) => {
		if (!searchQuery) return files;
		return files.filter(file =>
			file.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
	};

	const getFilteredLocalFiles = () => filterFiles(localFiles);
	const getFilteredRemoteFiles = () => filterFiles(remoteFiles);

	// Reset selection and scroll when search query changes
	useEffect(() => {
		if (searchQuery) {
			setLocalSelectedIndex(0);
			setRemoteSelectedIndex(0);
			setLocalScrollOffset(0);
			setRemoteScrollOffset(0);
		}
	}, [searchQuery]);

	// Key handlers
	useInput((input, key) => {
		if (!isActive) return; // Only handle input when active

		// Don't handle keys when in search mode (TextInput handles them)
		if (searchMode) {
			// Use Enter to exit search mode (Esc conflicts with global VM deselect)
			if (key.return) {
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
			setSearchQuery('');
			return;
		}

		// Navigation with auto-scroll
		const currentFiles = activePane === 'local' ? getFilteredLocalFiles() : getFilteredRemoteFiles();
		if (input === 'j' || key.downArrow) {
			if (activePane === 'local') {
				const currentIndex = localSelectedIndex;
				const currentScrollOffset = localScrollOffset;
				const newIndex = Math.min(currentIndex + 1, currentFiles.length - 1);
				// Auto-scroll down if selection moves below visible area
				const newScrollOffset = newIndex >= currentScrollOffset + maxVisibleFiles
					? newIndex - maxVisibleFiles + 1
					: currentScrollOffset;
				setLocalSelectedIndex(newIndex);
				if (newScrollOffset !== currentScrollOffset) {
					setLocalScrollOffset(newScrollOffset);
				}
			} else {
				const currentIndex = remoteSelectedIndex;
				const currentScrollOffset = remoteScrollOffset;
				const newIndex = Math.min(currentIndex + 1, currentFiles.length - 1);
				// Auto-scroll down if selection moves below visible area
				const newScrollOffset = newIndex >= currentScrollOffset + maxVisibleFiles
					? newIndex - maxVisibleFiles + 1
					: currentScrollOffset;
				setRemoteSelectedIndex(newIndex);
				if (newScrollOffset !== currentScrollOffset) {
					setRemoteScrollOffset(newScrollOffset);
				}
			}
		}
		if (input === 'k' || key.upArrow) {
			if (activePane === 'local') {
				const currentIndex = localSelectedIndex;
				const currentScrollOffset = localScrollOffset;
				const newIndex = Math.max(currentIndex - 1, 0);
				// Auto-scroll up if selection moves above visible area
				const newScrollOffset = newIndex < currentScrollOffset
					? newIndex
					: currentScrollOffset;
				setLocalSelectedIndex(newIndex);
				if (newScrollOffset !== currentScrollOffset) {
					setLocalScrollOffset(newScrollOffset);
				}
			} else {
				const currentIndex = remoteSelectedIndex;
				const currentScrollOffset = remoteScrollOffset;
				const newIndex = Math.max(currentIndex - 1, 0);
				// Auto-scroll up if selection moves above visible area
				const newScrollOffset = newIndex < currentScrollOffset
					? newIndex
					: currentScrollOffset;
				setRemoteSelectedIndex(newIndex);
				if (newScrollOffset !== currentScrollOffset) {
					setRemoteScrollOffset(newScrollOffset);
				}
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
						<Box key={actualIndex}>
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

			{/* Transferring message */}
			{transferring && (
				<Box marginBottom={1}>
					<Text color="yellow">Transferring file...</Text>
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
					<Text dimColor> (Enter to exit)</Text>
				</Box>
			)}

			{/* Dual pane file browser */}
			<Box flexGrow={1}>
				{/* Local pane */}
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor={activePane === 'local' ? 'cyan' : 'gray'} paddingX={1}>
					<Text bold color={activePane === 'local' ? 'cyan' : 'gray'}>
						Local: {localPath}
						{searchQuery && <Text dimColor> (filtered: {getFilteredLocalFiles().length}/{localFiles.length})</Text>}
					</Text>
					<Box flexDirection="column" marginTop={1}>
						{renderFileList(getFilteredLocalFiles(), localSelectedIndex, localScrollOffset, activePane === 'local')}
					</Box>
				</Box>

				{/* Remote pane */}
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor={activePane === 'remote' ? 'cyan' : 'gray'} paddingX={1}>
					<Text bold color={activePane === 'remote' ? 'cyan' : 'gray'}>
						Remote: {remotePath}
						{searchQuery && <Text dimColor> (filtered: {getFilteredRemoteFiles().length}/{remoteFiles.length})</Text>}
					</Text>
					{vm.status === 'connected' ? (
						<Box flexDirection="column" marginTop={1}>
							{renderFileList(getFilteredRemoteFiles(), remoteSelectedIndex, remoteScrollOffset, activePane === 'remote')}
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
