import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import type { VM, AuthType } from '../core/types.js';
import { ipcClient } from '../core/ipc.js';

interface AddVMScreenProps {
	onCancel: () => void;
	onSubmit: (vm: Partial<VM>) => void;
}

type FormStep = 'auth-type' | 'details';
type FormField = 'name' | 'host' | 'port' | 'username' | 'keyPath' | 'password';

export default function AddVMScreen({ onCancel, onSubmit }: AddVMScreenProps) {
	const [step, setStep] = useState<FormStep>('auth-type');
	const [authType, setAuthType] = useState<AuthType>('key');
	const [currentField, setCurrentField] = useState<FormField>('name');
	const [error, setError] = useState<string | null>(null);
	const [testing, setTesting] = useState(false);

	// Form data
	const [formData, setFormData] = useState({
		name: '',
		host: '',
		port: '22',
		username: '',
		keyPath: '~/.ssh/id_rsa',
		password: ''
	});

	// Handle auth type selection
	const handleAuthTypeSelect = (item: { value: AuthType }) => {
		setAuthType(item.value);
		setStep('details');
	};

	// Field definitions
	const fields: FormField[] = authType === 'key'
		? ['name', 'host', 'port', 'username', 'keyPath']
		: ['name', 'host', 'port', 'username', 'password'];

	const fieldLabels: Record<FormField, string> = {
		name: 'VM Name',
		host: 'Host (IP or hostname)',
		port: 'Port',
		username: 'Username',
		keyPath: 'SSH Key Path',
		password: 'Password'
	};

	const currentFieldIndex = fields.indexOf(currentField);

	// Handle field input
	const handleFieldChange = (value: string) => {
		setFormData(prev => ({ ...prev, [currentField]: value }));
	};

	// Move to next field
	const handleFieldSubmit = () => {
		if (currentFieldIndex < fields.length - 1) {
			setCurrentField(fields[currentFieldIndex + 1]);
		} else {
			handleFormSubmit();
		}
	};

	// Test connection and submit
	const handleFormSubmit = async () => {
		try {
			setError(null);
			setTesting(true);

			// Validate required fields
			const requiredFields = fields;
			const missingFields = requiredFields.filter(field => !formData[field]);

			if (missingFields.length > 0) {
				setError(`Missing required fields: ${missingFields.map(f => fieldLabels[f]).join(', ')}`);
				setTesting(false);
				return;
			}

			// Build VM object
			const vm: Partial<VM> = {
				name: formData.name,
				host: formData.host,
				port: parseInt(formData.port, 10),
				username: formData.username,
				auth: {
					type: authType,
					keyPath: authType === 'key' ? formData.keyPath : undefined,
					rememberPassword: authType === 'password'
				}
			};

			// Test connection
			await ipcClient.testConnection(vm);

			// Store password if using password auth
			if (authType === 'password' && formData.password) {
				// Password will be stored when VM is added
				// For now, we'll pass it through the submission
			}

			// Submit
			onSubmit(vm);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add VM');
		} finally {
			setTesting(false);
		}
	};

	// Key handlers for navigation
	useInput((input, key) => {
		if (key.escape) {
			onCancel();
		}

		// Navigate between fields with arrow keys (when not editing)
		if (step === 'details' && !testing) {
			if (key.upArrow && currentFieldIndex > 0) {
				setCurrentField(fields[currentFieldIndex - 1]);
			}
			if (key.downArrow && currentFieldIndex < fields.length - 1) {
				setCurrentField(fields[currentFieldIndex + 1]);
			}
		}
	});

	// Auth type selection step
	if (step === 'auth-type') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="cyan">Add New VM</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select authentication method:</Text>
				</Box>

				<SelectInput
					items={[
						{ label: 'SSH Key (recommended)', value: 'key' as AuthType },
						{ label: 'Password', value: 'password' as AuthType }
					]}
					onSelect={handleAuthTypeSelect}
				/>

				<Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
					<Text dimColor>
						<Text bold>↑/↓</Text> navigate • <Text bold>Enter</Text> select • <Text bold>Esc</Text> cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Details form step
	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">Add New VM</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Auth: {authType === 'key' ? 'SSH Key' : 'Password'}
				</Text>
			</Box>

			{/* Error message */}
			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			{/* Testing message */}
			{testing && (
				<Box marginBottom={1}>
					<Text color="yellow">Testing connection...</Text>
				</Box>
			)}

			{/* Form fields */}
			{!testing && (
				<Box flexDirection="column" marginBottom={1}>
					{fields.map((field, index) => {
						const isActive = field === currentField;
						const value = formData[field];
						const label = fieldLabels[field];

						return (
							<Box key={field} marginBottom={1} flexDirection="column">
								<Text bold={isActive}>
									{isActive ? '>' : ' '} {label}:
								</Text>
								{isActive ? (
									<Box marginLeft={2}>
										<TextInput
											value={value}
											onChange={handleFieldChange}
											onSubmit={handleFieldSubmit}
											placeholder={label}
											mask={field === 'password' ? '*' : undefined}
										/>
									</Box>
								) : (
									<Box marginLeft={2}>
										<Text dimColor>
											{value || <Text italic>(empty)</Text>}
										</Text>
									</Box>
								)}
							</Box>
						);
					})}
				</Box>
			)}

			{/* Status bar */}
			<Box borderStyle="single" borderColor="gray" paddingX={1}>
				<Text dimColor>
					<Text bold>Enter</Text> next field • {' '}
					<Text bold>↑/↓</Text> navigate • {' '}
					<Text bold>Esc</Text> cancel
				</Text>
			</Box>
		</Box>
	);
}
