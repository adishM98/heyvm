import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { VM, Tab } from './core/types.js';
import VMListScreen from './screens/VMListScreen.js';
import AddVMScreen from './screens/AddVMScreen.js';
import VMDetailScreen from './screens/VMDetailScreen.js';
import { ipcClient } from './core/ipc.js';

export default function App() {
	// Split-pane state model
	const [selectedVM, setSelectedVM] = useState<VM | null>(null);
	const [activeTab, setActiveTab] = useState<Tab>('terminal');
	const [showAddVMModal, setShowAddVMModal] = useState(false);
	const [activePaneSide, setActivePaneSide] = useState<'left' | 'right'>('left');
	const [vmListVersion, setVMListVersion] = useState(0);
	const { exit } = useApp();

	// Refresh selected VM after state changes
	const refreshSelectedVM = useCallback(async () => {
		if (!selectedVM) return;

		try {
			const vms = await ipcClient.listVMs();
			const updatedVM = vms.find(v => v.id === selectedVM.id);
			if (updatedVM) {
				setSelectedVM(updatedVM);
			} else {
				// VM was deleted, deselect it
				setSelectedVM(null);
				setActivePaneSide('left');
			}

			// Trigger VM list refresh
			setVMListVersion(v => v + 1);
		} catch (err) {
			console.error('Failed to refresh VM:', err);
		}
	}, [selectedVM]);

	// Handlers
	const handleSelectVM = (vm: VM) => {
		setSelectedVM(vm);
		setActivePaneSide('right');
		setActiveTab('overview'); // Always default to overview
		// No auto-connect - user must explicitly connect via 'c' key
	};

	const handleAddVMSubmit = async (vm: Partial<VM>, password?: string) => {
		try {
			const newVM = await ipcClient.addVM(vm);
			console.log('[App] VM added successfully:', newVM.id);
			
			// Store password in keychain after VM is added (now we have ID)
			if (password && newVM.id) {
				console.log('[App] Storing password for VM:', newVM.id);
				try {
					await ipcClient.storePassword(newVM.id, password);
					console.log('[App] Password stored successfully');
				} catch (passErr) {
					console.error('[App] Failed to store password:', passErr);
					// Show error to user but don't fail VM creation
					// Password can be re-entered later
				}
			}
			
			setShowAddVMModal(false);
			setSelectedVM(newVM);
			setActivePaneSide('right');
			setActiveTab('overview');
			// No auto-connect - user must explicitly connect via 'c' key
		} catch (err) {
			console.error('Failed to add VM:', err);
			// Error is handled in AddVMScreen, this is just a fallback
		}
	};

	const handleVMDeleted = () => {
		setSelectedVM(null);
		setActivePaneSide('left');
	};

	// Global keyboard handler
	// NOTE: When terminal tab is active, ALL input (including Ctrl+C) goes to terminal
	// Only Ctrl+O can exit the terminal tab back to overview
	useInput((input, key) => {
		// Modal takes precedence
		if (showAddVMModal) return;

		// Ctrl+O from terminal: switch to overview tab
		if (key.ctrl && input === 'o' && activePaneSide === 'right' && selectedVM && activeTab === 'terminal') {
			setActiveTab('overview');
			return;
		}

		// Terminal has COMPLETE input priority - don't intercept ANYTHING when terminal is active
		// This includes Ctrl+C, Ctrl+D, Escape, etc. - everything goes to the PTY
		if (activePaneSide === 'right' && selectedVM && activeTab === 'terminal') {
			return; // Let terminal handle all input
		}

		// Ctrl+C: Quit app (only when NOT in terminal tab)
		if (key.ctrl && input === 'c') {
			exit();
			return;
		}

		// Global quit (only from left pane with no selection)
		if (input === 'q' && activePaneSide === 'left' && !selectedVM) {
			exit();
		}

		// Tab switches panes (only when VM selected)
		// BUT: Don't intercept Tab in Files tab (it needs Tab for local/remote switching)
		if (key.tab && selectedVM && activeTab !== 'files') {
			setActivePaneSide(prev => prev === 'left' ? 'right' : 'left');
			return;
		}

		// Escape deselects VM (from right pane)
		if (key.escape && activePaneSide === 'right' && selectedVM) {
			setSelectedVM(null);
			setActivePaneSide('left');
			return;
		}

		// Tab switching via number keys (only from right pane, NOT in terminal)
		if (activePaneSide === 'right' && selectedVM && activeTab !== 'terminal') {
			if (input === '1') {
				setActiveTab('overview');
				return;
			}
			if (input === '2') {
				setActiveTab('terminal');
				return;
			}
			if (input === '3') {
				setActiveTab('files');
				return;
			}
		}

		// Add VM (only from left pane)
		if (input === 'a' && activePaneSide === 'left') {
			setShowAddVMModal(true);
			return;
		}
	});

	return (
		<Box flexDirection="column" height="100%">
			{showAddVMModal ? (
				// Modal mode: full-screen Add VM form
				<Box flexDirection="column" padding={2}>
					<AddVMScreen
						onCancel={() => setShowAddVMModal(false)}
						onSubmit={handleAddVMSubmit}
					/>
				</Box>
			) : (
				// Split pane mode: VM list + detail
				<Box flexGrow={1}>
					{/* Left pane - VM List (35%) */}
					<Box
						width="35%"
						flexDirection="column"
						borderStyle="single"
						borderColor="gray"
					>
						<VMListScreen
							selectedVM={selectedVM}
							onSelectVM={handleSelectVM}
							isActive={activePaneSide === 'left'}
							onVMDeleted={handleVMDeleted}
							vmListVersion={vmListVersion}
						/>
					</Box>

					{/* Right pane - VM Detail (65%) */}
					<Box
						width="65%"
						flexDirection="column"
						borderStyle="single"
						borderColor="gray"
					>
						{selectedVM ? (
							<VMDetailScreen
								vm={selectedVM}
								activeTab={activeTab}
								onTabChange={setActiveTab}
								isActive={activePaneSide === 'right'}
								onVMUpdated={refreshSelectedVM}
							/>
						) : (
							<Box
								flexDirection="column"
								padding={2}
								justifyContent="center"
								alignItems="center"
								height="100%"
							>
								<Text dimColor>No VM selected</Text>
								<Box marginTop={1}>
									<Text dimColor>Select a VM from the list to view details</Text>
								</Box>
								<Box marginTop={1}>
									<Text dimColor>Press 'a' to add a new VM</Text>
								</Box>
							</Box>
						)}
					</Box>
				</Box>
			)}
		</Box>
	);
}
