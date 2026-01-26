import type { IPCRequest, IPCResponse, VM, FileInfo } from './types.js';
import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';

// Global reference to core process streams (set by start-with-core.js)
declare global {
	var heyvmCore: {
		stdin: Writable;
		stdout: Readable;
		process: any;
	} | undefined;
}

export class IPCClient extends EventEmitter {
	private requestId = 0;
	private pendingRequests = new Map<number, {
		resolve: (response: IPCResponse<any>) => void;
		reject: (error: Error) => void;
	}>();
	private responseBuffer = '';

	constructor() {
		super();
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
					// Parse error - ignore
				}
			}
		});

		stdout.on('error', (err: Error) => {
			// Stdout error - ignore
		});
	}

	private handleResponse(response: IPCResponse | any) {
		// Check if this is an event (no request_id)
		if (response.event) {
			this.emit(response.event, response.data);
			return;
		}

		// Match response to request by ID
		const requestId = response.request_id;
		if (requestId !== undefined && this.pendingRequests.has(requestId)) {
			const pending = this.pendingRequests.get(requestId)!;
			this.pendingRequests.delete(requestId);
			pending.resolve(response);
		}
	}

	/**
	 * Send a fire-and-forget message (no response expected)
	 */
	send(message: any): void {
		if (!global.heyvmCore) {
			return;
		}

		const messageStr = JSON.stringify(message) + '\n';
		global.heyvmCore.stdin.write(messageStr, (err) => {
			// Ignore write errors
		});
	}

	/**
	 * Send a request to the backend and wait for response
	 */
	async sendRequest<T = unknown>(request: IPCRequest): Promise<IPCResponse<T>> {
		// If core process not available, return mock response
		if (!global.heyvmCore) {
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
	 * Test connection to a VM
	 */
	async testConnection(vm: Partial<VM>, password?: string): Promise<void> {
		const response = await this.sendRequest({
			action: 'test_connection',
			params: { 
				vm,
				password // Pass password for testing, won't be stored
			}
		});

		if (response.status === 'error') {
			throw new Error(response.message || 'Failed to test connection');
		}
	}

	/**
	 * Start a PTY session (fire-and-forget, emits PTY_READY event)
	 */
	startPTY(vmId: string, rows: number = 24, cols: number = 80): void {
		this.send({
			action: 'start_pty',
			params: { vm_id: vmId, rows, cols }
		});
	}

	/**
	 * Write data to a PTY session (fire-and-forget, non-blocking)
	 */
	writeToPTY(vmId: string, sessionId: string, data: string): void {
		this.send({
			action: 'write_to_pty',
			params: { vm_id: vmId, session_id: sessionId, data }
		});
	}

	/**
	 * Resize a PTY session
	 */
	resizePTY(vmId: string, sessionId: string, rows: number, cols: number): void {
		this.send({
			action: 'resize_pty',
			params: { vm_id: vmId, session_id: sessionId, rows, cols }
		});
	}

	/**
	 * Close a PTY session
	 */
	closePTY(vmId: string, sessionId: string): void {
		this.send({
			action: 'close_pty',
			params: { vm_id: vmId, session_id: sessionId }
		});
	}
}

// Singleton instance
export const ipcClient = new IPCClient();
