import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import type { VM, FileInfo } from '../../core/types.js';
import { ipcClient } from '../../core/ipc.js';

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
	
	const navigationThrottle = useRef(Date.now());

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

	// Throttled navigation
	const canNavigate = useCallback(() => {
		const now = Date.now();
		if (now - navigationThrottle.current < 30) return false;
		navigationThrottle.current = now;
		return true;
	}, []);

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
			const icon = file.isDir ? '📁' : '📄';
			const prefix = isSelected ? '▶ ' : '  ';
			const color = isSelected ? (pane === 'local' ? 'magenta' : 'cyan') : undefined;
			
			return (
				<Text key={actualIndex} bold={isSelected} color={color}>
					{prefix}{icon} {file.name}
				</Text>
			);
		});
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
					<Box flexDirection="column">
						{renderFileList(localFiles, localIndex, localScroll, 'local')}
					</Box>
				</Box>
				<Box flexDirection="column" width="50%" borderStyle="single" borderColor={activePane === 'remote' ? 'cyan' : 'gray'}>
					<Text bold color="cyan">Remote: {remotePath}</Text>
					<Box flexDirection="column">
						{renderFileList(remoteFiles, remoteIndex, remoteScroll, 'remote')}
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
