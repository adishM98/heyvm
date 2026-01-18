import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmDialogProps {
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
	useInput((input, key) => {
		if (input === 'y' || input === 'Y') {
			onConfirm();
		}
		if (input === 'n' || input === 'N' || key.escape) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1}>
			<Text>{message}</Text>
			<Box marginTop={1}>
				<Text dimColor>
					Press <Text bold>Y</Text> to confirm, <Text bold>N</Text> to cancel
				</Text>
			</Box>
		</Box>
	);
}
