import { useState, useCallback, useEffect } from 'react';
import type { VM, FileInfo, TransferProgress } from '../core/types.js';
import { ipcClient } from '../core/ipc.js';

export function useFiles(vm: VM) {
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [transferring, setTransferring] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);

	// Listen for transfer progress events
	useEffect(() => {
		const handleProgress = (progress: TransferProgress) => {
			if (progress.vm_id === vm.id) {
				setTransferProgress(progress);
			}
		};

		ipcClient.on('TRANSFER_PROGRESS', handleProgress);

		return () => {
			ipcClient.off('TRANSFER_PROGRESS', handleProgress);
		};
	}, [vm.id]);

	const listFiles = useCallback(async (path: string) => {
		try {
			setLoading(true);
			setError(null);
			const fileList = await ipcClient.listFiles(vm.id, path);
			setFiles(fileList);
			return fileList;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to list files');
			throw err;
		} finally {
			setLoading(false);
		}
	}, [vm.id]);

	const uploadFile = useCallback(async (localPath: string, remotePath: string) => {
		try {
			setTransferring(true);
			setError(null);
			setTransferProgress(null);
			await ipcClient.uploadFile(vm.id, localPath, remotePath);
			setTransferProgress(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Upload failed');
			throw err;
		} finally {
			setTransferring(false);
		}
	}, [vm.id]);

	const downloadFile = useCallback(async (remotePath: string, localPath: string) => {
		try {
			setTransferring(true);
			setError(null);
			setTransferProgress(null);
			await ipcClient.downloadFile(vm.id, remotePath, localPath);
			setTransferProgress(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Download failed');
			throw err;
		} finally {
			setTransferring(false);
		}
	}, [vm.id]);

	const deleteFile = useCallback(async (path: string) => {
		try {
			setError(null);
			await ipcClient.deleteFile(vm.id, path);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Delete failed');
			throw err;
		}
	}, [vm.id]);

	const renameFile = useCallback(async (oldPath: string, newPath: string) => {
		try {
			setError(null);
			await ipcClient.renameFile(vm.id, oldPath, newPath);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Rename failed');
			throw err;
		}
	}, [vm.id]);

	return {
		files,
		loading,
		transferring,
		transferProgress,
		error,
		listFiles,
		uploadFile,
		downloadFile,
		deleteFile,
		renameFile,
	};
}
