import type { IPCRequest, IPCResponse, VM, FileInfo } from './types.js';
import { Readable, Writable } from 'stream';

// Global reference to core process streams (set by start-with-core.js)
declare global {
	var heyvmCore: {
		stdin: Writable;
		stdout: Readable;
		process: any;
	} | undefined;
}

export class IPCClient {
	private requestId = 0;
	private pendingRequests = new Map<number, {
		resolve: (response: IPCResponse<any>) => void;
		reject: (error: Error) => void;
	}>();
	private responseBuffer = '';

	constructor() {
		// Set up response handler if core process is available
		if (global.heyvmCore) {
			this.setupResponseHandler();
		}
	}

	private setupResponseHandler() {
		const stdout = global.heyvmCore!.stdout;

		stdout.on('data', (chunk: Buffer) => {
			this.responseBuffer += chunk.toString();

			// Try to parse complete JSON responses
			const lines = this.responseBuffer.split('\n');
			this.responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const response = JSON.parse(line);
					this.handleResponse(response);
				} catch (err) {
					console.error('[IPC] Failed to parse response:', line, err);
				}
			}
		});

		stdout.on('error', (err: Error) => {
			console.error('[IPC] Stdout error:', err);
		});
	}

	private handleResponse(response: IPCResponse) {
		// Match response to request by ID
		const requestId = response.request_id;
		if (requestId !== undefined && this.pendingRequests.has(requestId)) {
			const pending = this.pendingRequests.get(requestId)!;
			this.pendingRequests.delete(requestId);
			pending.resolve(response);
		} else {
			console.warn('[IPC] Received response with no matching request:', response);
		}
	}

	/**
	 * Send a request to the backend and wait for response
	 */
	async sendRequest<T = unknown>(request: IPCRequest): Promise<IPCResponse<T>> {
		// If core process not available, return mock response
		if (!global.heyvmCore) {
			console.warn('[IPC] Core process not available, using mock response');
			return {
				status: 'success',
				message: `Mock response for ${request.action}`,
				data: {} as T
			};
		}

		return new Promise((resolve, reject) => {
			const id = this.requestId++;
			this.pendingRequests.set(id, { resolve, reject });

			// Add request ID to the request
			const requestWithId = {
				...request,
				request_id: id
			};

			// Write request to core stdin
			const requestStr = JSON.stringify(requestWithId) + '\n';
			global.heyvmCore!.stdin.write(requestStr, (err) => {
				if (err) {
					this.pendingRequests.delete(id);
					reject(new Error(`Failed to send IPC request: ${err.message}`));
				}
			});

			// Timeout after 30 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('IPC request timeout'));
				}
			}, 30000);
		});
	}

	/**
	 * List all VMs
	 */
	async listVMs(): Promise<VM[]> {
		const response = await this.sendRequest<VM[]>({
			action: 'list_vms'
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to list VMs');
		}

		return response.data || [];
	}

	/**
	 * Add a new VM
	 */
	async addVM(vm: Partial<VM>): Promise<VM> {
		const response = await this.sendRequest<VM>({
			action: 'add_vm',
			params: { vm }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to add VM');
		}

		if (!response.data) {
			throw new Error('No VM data returned');
		}

		return response.data;
	}

	/**
	 * Remove a VM
	 */
	async removeVM(vmId: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'remove_vm',
			params: { vm_id: vmId }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to remove VM');
		}
	}

	/**
	 * Connect to a VM
	 */
	async connectVM(vmId: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'connect_vm',
			params: { vm_id: vmId }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to connect to VM');
		}
	}

	/**
	 * Disconnect from a VM
	 */
	async disconnectVM(vmId: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'disconnect_vm',
			params: { vm_id: vmId }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to disconnect from VM');
		}
	}

	/**
	 * Execute a command on a VM
	 */
	async executeCommand(vmId: string, command: string): Promise<string> {
		const response = await this.sendRequest<{ output: string }>({
			action: 'execute_command',
			params: { vm_id: vmId, command }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to execute command');
		}

		return response.data?.output || '';
	}

	/**
	 * List files in a directory on a VM
	 */
	async listFiles(vmId: string, path: string): Promise<FileInfo[]> {
		const response = await this.sendRequest<FileInfo[]>({
			action: 'list_files',
			params: { vm_id: vmId, path }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to list files');
		}

		return response.data || [];
	}

	/**
	 * Upload a file to a VM
	 */
	async uploadFile(vmId: string, localPath: string, remotePath: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'upload_file',
			params: { vm_id: vmId, local_path: localPath, remote_path: remotePath }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to upload file');
		}
	}

	/**
	 * Download a file from a VM
	 */
	async downloadFile(vmId: string, remotePath: string, localPath: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'download_file',
			params: { vm_id: vmId, remote_path: remotePath, local_path: localPath }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to download file');
		}
	}

	/**
	 * Delete a file on a VM
	 */
	async deleteFile(vmId: string, path: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'delete_file',
			params: { vm_id: vmId, path }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to delete file');
		}
	}

	/**
	 * Rename a file on a VM
	 */
	async renameFile(vmId: string, oldPath: string, newPath: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'rename_file',
			params: { vm_id: vmId, old_path: oldPath, new_path: newPath }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to rename file');
		}
	}

	/**
	 * Store a password in the keychain
	 */
	async storePassword(vmId: string, password: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'store_password',
			params: { vm_id: vmId, password }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to store password');
		}
	}

	/**
	 * Test connection to a VM without saving it
	 */
	async testConnection(vm: Partial<VM>): Promise<void> {
		const response = await this.sendRequest({
			action: 'test_connection',
			params: { vm }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Connection test failed');
		}
	}

	/**
	 * Start an interactive PTY session
	 */
	async startPTY(vmId: string, rows: number = 24, cols: number = 80): Promise<string> {
		const response = await this.sendRequest<{ session_id: string }>({
			action: 'start_pty',
			params: { vm_id: vmId, rows, cols }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to start PTY session');
		}

		if (!response.data?.session_id) {
			throw new Error('No session ID returned');
		}

		return response.data.session_id;
	}

	/**
	 * Write data to a PTY session
	 */
	async writeToPTY(vmId: string, sessionId: string, data: string): Promise<number> {
		const response = await this.sendRequest<{ bytes_written: number }>({
			action: 'write_to_pty',
			params: { vm_id: vmId, session_id: sessionId, data }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to write to PTY');
		}

		return response.data?.bytes_written || 0;
	}

	/**
	 * Read data from a PTY session
	 */
	async readFromPTY(vmId: string, sessionId: string, maxBytes: number = 4096): Promise<string> {
		const response = await this.sendRequest<{ data: string; bytes_read: number }>({
			action: 'read_from_pty',
			params: { vm_id: vmId, session_id: sessionId, max_bytes: maxBytes }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to read from PTY');
		}

		return response.data?.data || '';
	}

	/**
	 * Close a PTY session
	 */
	async closePTY(vmId: string, sessionId: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'close_pty',
			params: { vm_id: vmId, session_id: sessionId }
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to close PTY session');
		}
	}
}

// Singleton instance
export const ipcClient = new IPCClient();
