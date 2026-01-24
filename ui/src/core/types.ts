// Type definitions matching Go backend models

export type VMStatus = 'unknown' | 'connected' | 'disconnected' | 'connecting' | 'error';
export type AuthType = 'key' | 'password';

export interface AuthConfig {
	type: AuthType;
	keyPath?: string;
	rememberPassword: boolean;
}

export interface VM {
	id: string;
	name: string;
	host: string;
	port: number;
	username: string;
	auth: AuthConfig;
	lastSeen: string; // ISO date string
	status: VMStatus;
}

export interface FileInfo {
	name: string;
	size: number;
	mode: number;
	modTime: string; // ISO date string
	isDir: boolean;
}

export interface TransferProgress {
	vm_id: string;
	file: string;
	direction: 'upload' | 'download';
	bytes_transferred: number;
	total_bytes: number;
	percent: number;
}

export interface IPCRequest {
	request_id?: number;
	action: string;
	params?: Record<string, unknown>;
}

export interface IPCResponse<T = unknown> {
	request_id?: number;
	status: 'success' | 'error';
	message?: string;
	data?: T;
}

// Tab types
export type Tab = 'overview' | 'terminal' | 'files';
