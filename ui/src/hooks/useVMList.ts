import { useState, useEffect, useCallback } from 'react';
import type { VM } from '../core/types.js';
import { ipcClient } from '../core/ipc.js';

export function useVMList() {
	const [vms, setVMs] = useState<VM[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadVMs = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const vmList = await ipcClient.listVMs();
			setVMs(vmList);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load VMs');
		} finally {
			setLoading(false);
		}
	}, []);

	const addVM = useCallback(async (vm: Partial<VM>) => {
		try {
			setError(null);
			await ipcClient.addVM(vm);
			await loadVMs();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add VM');
			throw err;
		}
	}, [loadVMs]);

	const removeVM = useCallback(async (vmId: string) => {
		try {
			setError(null);
			await ipcClient.removeVM(vmId);
			await loadVMs();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to remove VM');
			throw err;
		}
	}, [loadVMs]);

	// Load VMs on mount
	useEffect(() => {
		loadVMs();
	}, [loadVMs]);

	return {
		vms,
		loading,
		error,
		loadVMs,
		addVM,
		removeVM,
	};
}
