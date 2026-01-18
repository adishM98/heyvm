import { useState, useCallback } from 'react';
import type { VM } from '../core/types.js';
import { ipcClient } from '../core/ipc.js';

export function useVM(vm: VM) {
	const [connecting, setConnecting] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(async () => {
		try {
			setConnecting(true);
			setError(null);
			await ipcClient.connectVM(vm.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Connection failed');
			throw err;
		} finally {
			setConnecting(false);
		}
	}, [vm.id]);

	const disconnect = useCallback(async () => {
		try {
			setDisconnecting(true);
			setError(null);
			await ipcClient.disconnectVM(vm.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Disconnect failed');
			throw err;
		} finally {
			setDisconnecting(false);
		}
	}, [vm.id]);

	const executeCommand = useCallback(async (command: string) => {
		try {
			setError(null);
			return await ipcClient.executeCommand(vm.id, command);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Command execution failed');
			throw err;
		}
	}, [vm.id]);

	return {
		connecting,
		disconnecting,
		error,
		connect,
		disconnect,
		executeCommand,
	};
}
