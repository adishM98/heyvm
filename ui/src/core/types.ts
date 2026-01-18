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

export interface IPCRequest {
	action: string;
	params?: Record<string, unknown>;
}

export interface IPCResponse<T = unknown> {
	status: 'success' | 'error';
	message?: string;
	data?: T;
}

// Tab types
export type Tab = 'overview' | 'terminal' | 'files';
